const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const complianceUseCases = require('./compliance-use-cases');
const trainingHoursUseCase = require('./training-hours-use-case');
const presetsUseCases = require('./presets-use-cases');
const { buildCompletionWorkbookBuffer, buildComplianceWorkbookBuffer, buildEvidencePackBuffer } = require('./export');
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

// A5 (Modernization H1) — training-hours rollup for labour-law compliance.
const getTrainingHoursReport = async (req, res) => {
  try {
    const data = await trainingHoursUseCase.buildTrainingHoursReport(req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

// A5 part 2 — downloadable evidence pack (multi-sheet xlsx: summary + hours +
// compliance), timestamped and audited (entity:'Report').
const exportEvidencePack = async (req, res) => {
  try {
    const { from, to, departmentId } = req.query;
    const [hoursReport, complianceReport] = await Promise.all([
      trainingHoursUseCase.buildTrainingHoursReport({ from, to, groupBy: 'user', departmentId }),
      complianceUseCases.buildComplianceReport({ departmentId }, req.user),
    ]);

    const maxRows = complianceExportMaxRows();
    if (complianceReport.rows.length > maxRows) {
      throw new ServiceError(`Evidence pack exceeds the ${maxRows} compliance row limit`, 413);
    }

    const generatedAt = new Date().toISOString();
    const meta = {
      generatedAt,
      from: hoursReport.range.from.toISOString().slice(0, 10),
      to: hoursReport.range.to.toISOString().slice(0, 10),
      departmentScope: departmentId ? String(departmentId) : 'All departments',
    };
    const buffer = await buildEvidencePackBuffer({ meta, hoursReport, complianceReport });

    auditService.record({
      req,
      action: 'exported',
      entity: 'Report',
      note: `evidence-pack.xlsx — ${hoursReport.totals.employees} employees, ${complianceReport.summary.rows} compliance rows`,
    });

    const filename = `evidence-pack-${generatedAt.slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-TMS-Record-Count', complianceReport.summary.rows);
    res.send(Buffer.from(buffer));
  } catch (error) {
    handleError(res, error);
  }
};

// ── Saved report presets (A5 part 2) ──────────────────────
const listPresets = async (req, res) => {
  try {
    const data = await presetsUseCases.listPresets();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createPreset = async (req, res) => {
  try {
    const data = await presetsUseCases.createPreset(req.body, req.user?._id);
    auditService.record({ req, action: 'created', entity: 'ReportPreset', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updatePreset = async (req, res) => {
  try {
    const { before, after } = await presetsUseCases.updatePreset(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'ReportPreset', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archivePreset = async (req, res) => {
  try {
    const { before, after } = await presetsUseCases.archivePreset(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'ReportPreset', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
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
  getTrainingHoursReport,
  exportEvidencePack,
  listPresets,
  createPreset,
  updatePreset,
  archivePreset,
};
