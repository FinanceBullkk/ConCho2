#!/usr/bin/env node

// Read-only workbook profiler for English Training Phase 2 discovery.
// Usage: node scripts/eng-profile-phase2.js <workbook.xlsx>

const ExcelJS = require('exceljs');
const path = require('path');

const TARGET_SHEETS = [
  'CLASS_SESSIONS',
  'ATTENDANCE',
  'Attendance_Dropped',
  'ATTENDANCE_GRID',
  'ATTENDANCE_INPUT',
];

function primitive(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'object') {
    if (Object.hasOwn(value, 'result')) return primitive(value.result);
    if (Object.hasOwn(value, 'text')) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value.hyperlink) return value.text || value.hyperlink;
    return null;
  }
  return value;
}

function normalized(value) {
  const raw = primitive(value);
  if (raw === null || raw === '') return null;
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : raw;
}

function nonEmptyCells(row) {
  const cells = [];
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    const value = normalized(cell.value);
    if (value !== null) cells.push({ column, value });
  });
  return cells;
}

function detectHeaderRow(worksheet) {
  let best = { rowNumber: 1, cells: [] };
  const ceiling = Math.min(20, worksheet.actualRowCount || worksheet.rowCount);
  for (let rowNumber = 1; rowNumber <= ceiling; rowNumber += 1) {
    const cells = nonEmptyCells(worksheet.getRow(rowNumber));
    const textCount = cells.filter(({ value }) => typeof value === 'string').length;
    const score = cells.length + textCount;
    const bestTextCount = best.cells.filter(({ value }) => typeof value === 'string').length;
    if (score > best.cells.length + bestTextCount) best = { rowNumber, cells };
  }
  return best;
}

function profileSheet(worksheet) {
  const header = detectHeaderRow(worksheet);
  const headerByColumn = new Map(header.cells.map(({ column, value }) => [column, String(value)]));
  const rows = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= header.rowNumber) return;
    const record = { __row: rowNumber };
    let meaningful = false;
    headerByColumn.forEach((label, column) => {
      const value = normalized(row.getCell(column).value);
      record[label] = value;
      if (value !== null) meaningful = true;
    });
    if (meaningful) rows.push(record);
  });

  const columns = [...headerByColumn.values()];
  const cardinality = {};
  for (const column of columns) {
    const counts = new Map();
    for (const row of rows) {
      const value = row[column];
      if (value === null) continue;
      const key = value instanceof Date ? value.toISOString() : String(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    cardinality[column] = {
      distinct: counts.size,
      blank: rows.filter((row) => row[column] === null).length,
      values: counts.size <= 30 ? sorted : sorted.slice(0, 10),
    };
  }

  return {
    name: worksheet.name,
    dimensions: worksheet.dimensions,
    headerRow: header.rowNumber,
    columns,
    meaningfulRows: rows.length,
    cardinality,
    sample: rows.slice(0, 3),
  };
}

function tableRows(worksheet) {
  const headers = new Map();
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const value = normalized(cell.value);
    if (value !== null) headers.set(column, String(value));
  });
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = { __row: rowNumber };
    let meaningful = false;
    headers.forEach((header, column) => {
      const value = normalized(row.getCell(column).value);
      record[header] = value;
      if (value !== null) meaningful = true;
    });
    if (meaningful) rows.push(record);
  });
  return rows;
}

const keyPart = (value) => String(value ?? '').replace(/\.0$/, '').trim().toLowerCase();
const runKey = (row) => `${keyPart(row['Class Code'])}|${keyPart(row['Course Name'])}`;
const sessionKey = (row) => `${runKey(row)}|${keyPart(row['Session No'])}`;
const enrollmentKey = (row) => `${keyPart(row['Emp Code'])}|${runKey(row)}`;

function duplicateSummary(rows, keyFor) {
  const counts = new Map();
  rows.forEach((row) => counts.set(keyFor(row), (counts.get(keyFor(row)) || 0) + 1));
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  return { keys: counts.size, duplicateKeys: duplicates.length, duplicateRows: duplicates.reduce((sum, [, count]) => sum + count - 1, 0) };
}

function duplicateGroups(rows, keyFor) {
  const groups = new Map();
  rows.forEach((row) => groups.set(keyFor(row), [...(groups.get(keyFor(row)) || []), row]));
  return [...groups.entries()].filter(([, members]) => members.length > 1);
}

function analyzeCanonicalSources(workbook) {
  const sheets = Object.fromEntries(
    ['CLASS_SESSIONS', 'ATTENDANCE', 'CLASSES', 'ENROLLMENTS', 'STUDENTS', 'COURSE_PLAN']
      .map((name) => [name, workbook.getWorksheet(name)]),
  );
  const rows = Object.fromEntries(Object.entries(sheets).map(([name, sheet]) => [name, tableRows(sheet)]));
  const runKeys = new Set(rows.CLASSES.map(runKey));
  const sessionByKey = new Map(rows.CLASS_SESSIONS.map((row) => [sessionKey(row), row]));
  const enrollmentKeys = new Set(rows.ENROLLMENTS.map(enrollmentKey));
  const employeeKeys = new Set(rows.STUDENTS.map((row) => keyPart(row['Emp Code'])));
  const expectedByCourse = new Map(rows.COURSE_PLAN.map((row) => [keyPart(row['Course Name']), Number(row['Expected Sessions'])]));

  const unresolvedSessionRuns = rows.CLASS_SESSIONS.filter((row) => !runKeys.has(runKey(row)));
  const unresolvedAttendanceSessions = rows.ATTENDANCE.filter((row) => !sessionByKey.has(sessionKey(row)));
  const unresolvedAttendanceEnrollments = rows.ATTENDANCE.filter((row) => !enrollmentKeys.has(enrollmentKey(row)));
  const unresolvedAttendanceEmployees = rows.ATTENDANCE.filter((row) => !employeeKeys.has(keyPart(row['Emp Code'])));
  const dateMismatches = rows.ATTENDANCE.filter((row) => {
    const session = sessionByKey.get(sessionKey(row));
    return session && keyPart(session.Date) !== keyPart(row.Date);
  });
  const unitsBeyondExpected = rows.CLASS_SESSIONS.filter((row) => {
    const expected = expectedByCourse.get(keyPart(row['Course Name']));
    return Number.isFinite(expected) && Number(row['Session No']) > expected;
  });
  const attendanceSessionKeys = new Set(rows.ATTENDANCE.map(sessionKey));
  const sessionsWithoutAttendance = rows.CLASS_SESSIONS.filter((row) => !attendanceSessionKeys.has(sessionKey(row)));
  const droppedRows = rows.ATTENDANCE.filter((row) => keyPart(row['Dropped Enrollment']) === 'yes');
  const attendanceDuplicateGroups = duplicateGroups(
    rows.ATTENDANCE,
    (row) => `${enrollmentKey(row)}|${keyPart(row['Session No'])}`,
  );
  const duplicateConflicts = attendanceDuplicateGroups.filter(([, members]) =>
    new Set(members.map((row) => `${keyPart(row.Status)}|${keyPart(row.Date)}`)).size > 1);

  return {
    counts: Object.fromEntries(Object.entries(rows).map(([name, value]) => [name, value.length])),
    sessionKey: duplicateSummary(rows.CLASS_SESSIONS, sessionKey),
    attendanceKey: duplicateSummary(rows.ATTENDANCE, (row) => `${enrollmentKey(row)}|${keyPart(row['Session No'])}`),
    attendanceDuplicateConflicts: duplicateConflicts.length,
    unresolved: {
      sessionRuns: unresolvedSessionRuns.length,
      attendanceSessions: unresolvedAttendanceSessions.length,
      attendanceEnrollments: unresolvedAttendanceEnrollments.length,
      attendanceEmployees: unresolvedAttendanceEmployees.length,
    },
    dateMismatches: dateMismatches.length,
    unitsBeyondExpected: unitsBeyondExpected.length,
    sessionsWithoutAttendance: sessionsWithoutAttendance.length,
    droppedAttendanceRows: droppedRows.length,
    statuses: [...new Set(rows.ATTENDANCE.map((row) => row.Status))].sort(),
    samples: {
      unresolvedAttendanceSessions: unresolvedAttendanceSessions.slice(0, 5),
      dateMismatches: dateMismatches.slice(0, 5),
      unitsBeyondExpected: unitsBeyondExpected.slice(0, 5),
      sessionsWithoutAttendance: sessionsWithoutAttendance.slice(0, 5),
      attendanceDuplicates: attendanceDuplicateGroups.slice(0, 5),
      attendanceDuplicateConflicts: duplicateConflicts.slice(0, 5),
    },
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Workbook path is required');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(input));

  if (process.argv.includes('--analyze')) {
    process.stdout.write(`${JSON.stringify(analyzeCanonicalSources(workbook), null, 2)}\n`);
    return;
  }

  const rawIndex = process.argv.indexOf('--raw');
  if (rawIndex !== -1) {
    const requested = process.argv[rawIndex + 1];
    const sheet = workbook.worksheets.find((candidate) => candidate.name.toLowerCase() === requested?.toLowerCase());
    if (!sheet) throw new Error(`Sheet not found: ${requested}`);
    const rows = [];
    const limit = Math.min(sheet.actualRowCount || sheet.rowCount, 6);
    for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
      const values = [];
      const row = sheet.getRow(rowNumber);
      for (let column = 1; column <= Math.min(sheet.actualColumnCount || sheet.columnCount, 30); column += 1) {
        const cell = row.getCell(column);
        const value = normalized(cell.value);
        const formula = typeof cell.value === 'object' && cell.value?.formula ? cell.value.formula : null;
        if (value !== null || formula) values.push({ column, value, formula });
      }
      rows.push({ row: rowNumber, values });
    }
    process.stdout.write(`${JSON.stringify({ sheet: sheet.name, dimensions: sheet.dimensions, rows }, null, 2)}\n`);
    return;
  }

  const byLowerName = new Map(workbook.worksheets.map((sheet) => [sheet.name.toLowerCase(), sheet]));
  const targets = TARGET_SHEETS.map((name) => byLowerName.get(name.toLowerCase())).filter(Boolean);

  const result = {
    workbook: path.basename(input),
    sheets: workbook.worksheets.map((sheet) => sheet.name),
    targetProfiles: targets.map(profileSheet),
    missingTargets: TARGET_SHEETS.filter((name) => !byLowerName.has(name.toLowerCase())),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
