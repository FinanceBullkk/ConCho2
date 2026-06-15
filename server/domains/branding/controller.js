const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

const getBranding = async (req, res) => {
  try {
    res.json({ success: true, data: await useCases.getConfig() });
  } catch (error) {
    handleError(res, error);
  }
};

const updateBranding = async (req, res) => {
  try {
    const { before, after } = await useCases.updateConfig(req.body);
    auditService.record({ req, action: 'updated', entity: 'TenantConfig', entityId: after._id, diff: auditService.diff(before, after), note: 'Branding & templates updated' });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getBranding, updateBranding };
