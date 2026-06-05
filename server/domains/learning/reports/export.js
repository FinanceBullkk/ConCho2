const ExcelJS = require('exceljs');
const { safeCell } = require('../../../helpers/excel-formula-guard');

const yesNo = (b) => (b ? 'Yes' : 'No');
const reqMet = (required, met) => (required ? (met ? 'Met' : 'Unmet') : 'N/A');
const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

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
    'Certificate', 'Cert Status', 'Cert Issued At', 'Cert Valid Until', 'Cert State',
  ]);
  header.font = { bold: true };

  report.rows.forEach((r) => {
    sheet.addRow([
      // SEC-004: user-controlled strings (empCode/name/department, and the
      // cert number which echoes stored data) pass through safeCell so a
      // formula-leading value cannot auto-execute when HR opens the file.
      safeCell(r.learner.empCode),
      safeCell(r.learner.name),
      safeCell(r.learner.department),
      r.attendancePercent,
      yesNo(r.attendanceMet),
      reqMet(r.assessmentRequired, r.assessmentMet),
      reqMet(r.feedbackRequired, r.feedbackMet),
      yesNo(r.complete),
      safeCell(r.certificate ? r.certificate.number : ''),
      r.certificate ? r.certificate.status : '',
      dateOnly(r.certificate?.issuedAt),
      dateOnly(r.certificate?.validUntil),
      safeCell(r.certificate ? r.certificate.state : ''),
    ]);
  });

  sheet.columns.forEach((col) => { col.width = 16; });

  return workbook.xlsx.writeBuffer();
};

const buildComplianceWorkbookBuffer = async (report) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Compliance');
  sheet.addRow([`Generated: ${report.generatedAt}`]);
  sheet.addRow([
    `Rows: ${report.summary.rows}`,
    `Complete: ${report.summary.complete}`,
    `Overdue: ${report.summary.overdue}`,
    `Issued: ${report.summary.issued}`,
    `Missing: ${report.summary.missing}`,
  ]);
  sheet.addRow([]);

  const header = sheet.addRow([
    'Emp Code', 'Learner Name', 'Email', 'Department', 'Manager',
    'Assignment', 'Target Type', 'Target Name', 'Due Date',
    'Assignment Status', 'Completion', 'Certificate Number',
    'Certificate Status', 'Issued At', 'Valid Until', 'Certificate State',
  ]);
  header.font = { bold: true };

  report.rows.forEach((r) => {
    sheet.addRow([
      safeCell(r.learner.empCode),
      safeCell(r.learner.name),
      safeCell(r.learner.email),
      safeCell(r.org.departmentName),
      safeCell(r.org.managerName),
      safeCell(r.assignment.title),
      safeCell(r.assignment.targetType),
      safeCell(r.assignment.targetName),
      dateOnly(r.assignment.dueDate),
      safeCell(r.assignment.status),
      yesNo(r.completion.complete),
      safeCell(r.certificate.number),
      safeCell(r.certificate.status || ''),
      dateOnly(r.certificate.issuedAt),
      dateOnly(r.certificate.validUntil),
      safeCell(r.certificate.state),
    ]);
  });

  sheet.columns.forEach((col) => { col.width = 18; });
  return workbook.xlsx.writeBuffer();
};

module.exports = { buildCompletionWorkbookBuffer, buildComplianceWorkbookBuffer };
