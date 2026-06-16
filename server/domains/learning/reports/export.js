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

// Fill a worksheet with the compliance header + per-learner rows. Shared by the
// standalone compliance export and the evidence pack so the layout stays in sync.
const fillComplianceSheet = (sheet, rows) => {
  const header = sheet.addRow([
    'Emp Code', 'Learner Name', 'Email', 'Department', 'Manager',
    'Assignment', 'Target Type', 'Target Name', 'Due Date',
    'Assignment Status', 'Completion', 'Certificate Number',
    'Certificate Status', 'Issued At', 'Valid Until', 'Certificate State',
  ]);
  header.font = { bold: true };
  rows.forEach((r) => {
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

  fillComplianceSheet(sheet, report.rows);
  return workbook.xlsx.writeBuffer();
};

// A5 part 2 — the downloadable evidence pack: one timestamped workbook with a
// Summary cover, the training-hours table, and the compliance table. (PDF + zip
// from the handoff are deferred — no PDF dependency in-repo; the multi-sheet
// xlsx is itself audit-ready.)
const buildEvidencePackBuffer = async ({ meta, hoursReport, complianceReport }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Training Evidence Pack']);
  summary.addRow([`Generated: ${meta.generatedAt}`]);
  summary.addRow([`Window: ${meta.from} → ${meta.to}`]);
  summary.addRow([`Department scope: ${safeCell(meta.departmentScope)}`]);
  summary.addRow([]);
  summary.addRow(['Training hours']);
  summary.addRow(['Employees', hoursReport.totals.employees]);
  summary.addRow(['Sessions attended', hoursReport.totals.sessions]);
  summary.addRow(['Total hours', hoursReport.totals.hours]);
  summary.addRow([]);
  summary.addRow(['Compliance']);
  summary.addRow(['Rows', complianceReport.summary.rows]);
  summary.addRow(['Complete', complianceReport.summary.complete]);
  summary.addRow(['Overdue', complianceReport.summary.overdue]);
  summary.addRow(['Issued certificates', complianceReport.summary.issued]);
  summary.addRow(['Missing', complianceReport.summary.missing]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getRow(6).font = { bold: true };
  summary.getRow(11).font = { bold: true };
  summary.columns.forEach((col) => { col.width = 24; });

  const hoursSheet = workbook.addWorksheet('Training Hours');
  const hoursHeader = hoursSheet.addRow(['Emp Code', 'Name', 'Department', 'Sessions', 'Hours']);
  hoursHeader.font = { bold: true };
  hoursReport.rows.forEach((r) => {
    hoursSheet.addRow([safeCell(r.empCode), safeCell(r.name), safeCell(r.department), r.sessions, r.hours]);
  });
  hoursSheet.columns.forEach((col) => { col.width = 18; });

  fillComplianceSheet(workbook.addWorksheet('Compliance'), complianceReport.rows);

  return workbook.xlsx.writeBuffer();
};

module.exports = { buildCompletionWorkbookBuffer, buildComplianceWorkbookBuffer, buildEvidencePackBuffer };
