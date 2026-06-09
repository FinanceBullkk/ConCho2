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

// Map status code → Vietnamese text
const STATUS_TEXT = {
  P: 'Có mặt',
  A: 'Vắng mặt',
  L: 'Đi muộn',
  EL: 'Có phép',
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
    headerFooter: { firstHeader: 'TMS - Báo Cáo Điểm Danh' },
  });

  // ── Define columns ───────────────────────────────────────
  sheet.columns = [
    { header: 'Mã NV',           key: 'empCode',       width: 12 },
    { header: 'Họ Tên',          key: 'userName',      width: 22 },
    { header: 'Phòng Ban',       key: 'department',    width: 18 },
    { header: 'Vai Trò',         key: 'userRole',      width: 12 },
    { header: 'Mã Lớp',          key: 'classCode',     width: 10 },
    { header: 'Khóa Học',        key: 'courseName',    width: 25 },
    { header: 'Nhóm',            key: 'teamName',      width: 18 },
    { header: 'Ngày Học',        key: 'dateStr',        width: 14 },
    { header: 'Giờ BĐ',         key: 'startStr',       width: 10 },
    { header: 'Giờ KT',          key: 'endStr',         width: 10 },
    { header: 'Thời Lượng (ph)', key: 'duration',       width: 14 },
    { header: 'Điểm Danh',      key: 'statusText',    width: 14 },
    { header: 'Mã ĐD',           key: 'status',        width: 8 },
    { header: 'Ghi Chú',         key: 'remark',        width: 25 },
    { header: 'Ngày Ghi',        key: 'attendanceDate', width: 18 },
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
