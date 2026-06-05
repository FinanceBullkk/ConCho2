const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const { buildCompletionWorkbookBuffer } = require('./export');

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

module.exports = { getCompletionReport, getCompletionRollup, exportCompletionReport };
