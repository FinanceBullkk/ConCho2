const ExcelJS = require('exceljs');

const yesNo = (b) => (b ? 'Yes' : 'No');
const reqMet = (required, met) => (required ? (met ? 'Met' : 'Unmet') : 'N/A');

// Build an .xlsx workbook buffer for a completion report. One sheet, a summary
// banner row, then a per-learner table. Returns a Buffer (small per-cohort data,
// so writeBuffer is fine — no streaming needed).
const buildCompletionWorkbookBuffer = async (report) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Completion');

  sheet.addRow([`Cohort: ${report.cohort.code} — ${report.cohort.programName}`]);
  sheet.addRow([
    `Complete: ${report.summary.complete}/${report.summary.total}`,
    `Completion rate: ${report.summary.completionRate}%`,
    `Certificates issued: ${report.summary.certificatesIssued}`,
  ]);
  sheet.addRow([]);

  const header = sheet.addRow([
    'Emp Code', 'Name', 'Department',
    'Attendance %', 'Attendance Met',
    'Assessment', 'Feedback', 'Complete',
    'Certificate', 'Cert Status',
  ]);
  header.font = { bold: true };

  report.rows.forEach((r) => {
    sheet.addRow([
      r.learner.empCode,
      r.learner.name,
      r.learner.department,
      r.attendancePercent,
      yesNo(r.attendanceMet),
      reqMet(r.assessmentRequired, r.assessmentMet),
      reqMet(r.feedbackRequired, r.feedbackMet),
      yesNo(r.complete),
      r.certificate ? r.certificate.number : '',
      r.certificate ? r.certificate.status : '',
    ]);
  });

  sheet.columns.forEach((col) => { col.width = 16; });

  return workbook.xlsx.writeBuffer();
};

module.exports = { buildCompletionWorkbookBuffer };
