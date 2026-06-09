const ExcelJS = require('exceljs');
const { toVN } = require('../../helpers/dayjsConfig');
const { safeCell } = require('../../helpers/excel-formula-guard');

// ──────────────────────────────────────────────────────────
// Attendance workbook (Excel rendering)
// ──────────────────────────────────────────────────────────
// Pure presentation: turn flattened attendance records (from
// attendance-export.queryExportData) into an ExcelJS workbook. Every
// user-controllable string passes through safeCell() (SEC-004) to
// neutralise spreadsheet formula injection.

// Map status code → English text
const STATUS_TEXT = {
  P: 'Present',
  A: 'Absent',
  L: 'Late',
  EL: 'Excused',
};

/**
 * Generate an Excel workbook from attendance data.
 *
 * @param {Array} records  Output from queryExportData
 * @param {WritableStream|null} streamRes  Optional Express res to stream into
 * @returns {Buffer|null} Excel Buffer, or null when streamed to streamRes
 */
const generateAttendanceWorkbook = async (records, streamRes = null) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS Export';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Attendance Export', {
    headerFooter: { firstHeader: 'TMS - Attendance Report' },
  });

  // ── Define columns ───────────────────────────────────────
  sheet.columns = [
    { header: 'Emp Code',        key: 'empCode',       width: 12 },
    { header: 'Full Name',       key: 'userName',      width: 22 },
    { header: 'Department',      key: 'department',    width: 18 },
    { header: 'Role',            key: 'userRole',      width: 12 },
    { header: 'Class Code',      key: 'classCode',     width: 10 },
    { header: 'Course',          key: 'courseName',    width: 25 },
    { header: 'Group',           key: 'teamName',      width: 18 },
    { header: 'Date',            key: 'dateStr',        width: 14 },
    { header: 'Start',          key: 'startStr',       width: 10 },
    { header: 'End',             key: 'endStr',         width: 10 },
    { header: 'Duration (min)',  key: 'duration',       width: 14 },
    { header: 'Attendance',     key: 'statusText',    width: 14 },
    { header: 'Status Code',     key: 'status',        width: 8 },
    { header: 'Remark',          key: 'remark',        width: 25 },
    { header: 'Recorded At',     key: 'attendanceDate', width: 18 },
  ];

  // ── Style header row ─────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 24;

  // ── Add data rows ────────────────────────────────────────
  for (const r of records) {
    const startDate = new Date(r.startTime);
    const endDate = new Date(r.endTime);

    // SEC-004: every user-controllable string passes through safeCell()
    // to neutralise spreadsheet formula injection.
    sheet.addRow({
      empCode: safeCell(r.empCode),
      userName: safeCell(r.userName),
      department: safeCell(r.department || ''),
      userRole: safeCell(r.userRole),
      classCode: safeCell(r.classCode),
      courseName: safeCell(r.courseName),
      teamName: safeCell(r.teamName),
      dateStr: toVN(startDate).format('DD/MM/YYYY'),
      startStr: toVN(startDate).format('HH:mm'),
      endStr: toVN(endDate).format('HH:mm'),
      duration: Math.round(r.durationMinutes),
      statusText: safeCell(STATUS_TEXT[r.status] || r.status),
      status: r.status,
      remark: safeCell(r.remark || ''),
      attendanceDate: toVN(r.attendanceDate).format('DD/MM/YYYY HH:mm'),
    });
  }

  // ── Auto-filter on header row ────────────────────────────
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  // ── Generate output ──────────────────────────────────────
  // PERF-001: If a writable stream (Express res) is provided,
  // stream directly to it instead of buffering in memory.
  if (streamRes && typeof streamRes.pipe === 'function') {
    await workbook.xlsx.write(streamRes);
    return null; // caller must not call res.send()
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = { STATUS_TEXT, generateAttendanceWorkbook };
