const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const complianceUseCases = require('./compliance-use-cases');
const { buildCompletionWorkbookBuffer, buildComplianceWorkbookBuffer } = require('./export');
const { ServiceError } = require('../../../helpers/ServiceError');

const complianceExportMaxRows = () => Number(process.env['COMPLIANCE_EXPORT_MAX_ROWS'] || 5000);

const getCompletionReport = async (req, res) => {
  try {
    const report = await useCases.buildCompletionReport(req.query.cohortId, req.user);
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(res, error);
  }
};

const getCompletionRollup = async (req, res) => {
  try {
    const report = await useCases.buildCompletionRollup(req.user);
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(res, error);
  }
};

const exportCompletionReport = async (req, res) => {
  try {
    const report = await useCases.buildCompletionReport(req.query.cohortId, req.user);
    const buffer = await buildCompletionWorkbookBuffer(report);

    auditService.record({
      req,
      action: 'exported',
      entity: 'Report',
      entityId: report.cohort.id,
      note: `completion-${report.cohort.code}.xlsx — ${report.summary.total} learners`,
    });

    const filename = `completion-${report.cohort.code}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-TMS-Record-Count', report.summary.total);
    res.send(Buffer.from(buffer));
  } catch (error) {
    handleError(res, error);
  }
};

const getComplianceReport = async (req, res) => {
  try {
    const report = await complianceUseCases.buildComplianceReport(req.query, req.user);
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(res, error);
  }
};

const exportComplianceReport = async (req, res) => {
  try {
    const report = await complianceUseCases.buildComplianceReport(req.query, req.user);
    const maxRows = complianceExportMaxRows();
    if (report.rows.length > maxRows) {
      throw new ServiceError(`Compliance export exceeds the ${maxRows} row limit`, 413);
    }
    const buffer = await buildComplianceWorkbookBuffer(report);

    auditService.record({
      req,
      action: 'exported',
      entity: 'Report',
      note: `compliance-report.xlsx — ${report.summary.rows} rows`,
    });

    const filename = `compliance-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-TMS-Record-Count', report.summary.rows);
    res.send(Buffer.from(buffer));
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getCompletionReport,
  getCompletionRollup,
  exportCompletionReport,
  getComplianceReport,
  exportComplianceReport,
};
