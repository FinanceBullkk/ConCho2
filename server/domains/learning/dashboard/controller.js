const { handleError } = require('../../../helpers/handleError');
const auditService = require('../../../services/auditService');
const useCases = require('./use-cases');
const executiveUseCases = require('./executive-use-cases');
const { COST_CONFIG_KEY } = require('./executive-repository');

// Read-only — no audit entry (mutations only get audited).
const getOperationalDashboard = async (req, res) => {
  try {
    const data = await useCases.buildOperationalDashboard(req.user, {
      window: req.query.window,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

// Admin-only inside the use-case (mirrors the compliance report gate).
const getExecutiveDashboard = async (req, res) => {
  try {
    const data = await executiveUseCases.buildExecutiveDashboard(req.user, {
      window: req.query.window,
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getCostConfig = async (req, res) => {
  try {
    const data = await executiveUseCases.getCostConfig(req.user);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const putCostConfig = async (req, res) => {
  try {
    const { before, after } = await executiveUseCases.setCostConfig(req.user, req.body);
    auditService.record({
      req,
      action: before === null ? 'created' : 'updated',
      entity: 'Setting',
      diff: { [COST_CONFIG_KEY]: { before, after } },
      note: `setting ${COST_CONFIG_KEY}`,
    });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getOperationalDashboard,
  getExecutiveDashboard,
  getCostConfig,
  putCostConfig,
};
