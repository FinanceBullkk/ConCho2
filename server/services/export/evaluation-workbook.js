const ExcelJS = require('exceljs');
const { toVN } = require('../../helpers/dayjsConfig');
const { safeCell } = require('../../helpers/excel-formula-guard');

// ──────────────────────────────────────────────────────────
// Evaluation workbook (Excel rendering)
// ──────────────────────────────────────────────────────────
// Pure presentation for evaluation export. Unlike attendance, evaluations
// are NOT marked as exported — they can be re-exported any number of times
// (snapshots, not events). Every user-controllable string passes through
// safeCell() (SEC-004) to neutralise spreadsheet formula injection.

/**
 * Generate an Excel workbook from evaluation data.
 *
 * @param {Array} records  Output from queryEvaluationData
 * @param {WritableStream|null} streamRes  Optional Express res to stream into
 * @returns {Buffer|null} Excel Buffer, or null when streamed to streamRes
 */
const generateEvaluationWorkbook = async (records, streamRes = null) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS Export';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Evaluation Export', {
    headerFooter: { firstHeader: 'TMS - Evaluation Report' },
  });

  sheet.columns = [
    { header: 'Emp Code',      key: 'empCode',          width: 12 },
    { header: 'Full Name',     key: 'userName',         width: 22 },
    { header: 'Department',    key: 'department',       width: 18 },
    { header: 'Class Code',    key: 'classCode',        width: 10 },
    { header: 'Course',        key: 'courseName',       width: 25 },
    { header: 'Level',         key: 'level',            width: 12 },
    { header: 'Grammar',       key: 'grammarScore',     width: 10 },
    { header: 'Vocabulary',    key: 'vocabularyScore',  width: 10 },
    { header: 'Pronunciation', key: 'pronunciationScore', width: 10 },
    { header: 'Fluency',       key: 'fluencyScore',     width: 10 },
    { header: 'Avg Score',     key: 'averageScore',     width: 10 },
    { header: 'Comment',       key: 'teacherComment',   width: 35 },
    { header: 'Updated',       key: 'updatedStr',       width: 18 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 24;

  for (const r of records) {
    // SEC-004: every user-controllable string passes through safeCell()
    // to neutralise spreadsheet formula injection.
    sheet.addRow({
      empCode:            safeCell(r.empCode),
      userName:           safeCell(r.userName),
      department:         safeCell(r.department || ''),
      classCode:          safeCell(r.classCode),
      courseName:         safeCell(r.courseName),
      level:              safeCell(r.level || ''),
      grammarScore:       r.grammarScore,
      vocabularyScore:    r.vocabularyScore,
      pronunciationScore: r.pronunciationScore,
      fluencyScore:       r.fluencyScore,
      averageScore:       Math.round(r.averageScore * 100) / 100,
      teacherComment:     safeCell(r.teacherComment || ''),
      updatedStr:         toVN(r.updatedAt).format('DD/MM/YYYY HH:mm'),
    });
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  // PERF-001: If a writable stream (Express res) is provided,
  // stream directly to it instead of buffering in memory.
  if (streamRes && typeof streamRes.pipe === 'function') {
    await workbook.xlsx.write(streamRes);
    return null; // caller must not call res.send()
  }
  return workbook.xlsx.writeBuffer();
};

module.exports = { generateEvaluationWorkbook };
