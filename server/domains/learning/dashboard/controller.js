const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');

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

module.exports = { getOperationalDashboard };
