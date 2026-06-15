const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

const listRules = async (req, res) => {
  try {
    res.json({ success: true, data: await useCases.listRules() });
  } catch (error) {
    handleError(res, error);
  }
};

const createRule = async (req, res) => {
  try {
    const rule = await useCases.createRule(req.body);
    auditService.record({ req, action: 'created', entity: 'AutomationRule', entityId: rule._id, diff: { after: rule }, note: `Automation rule '${rule.name}' created` });
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    handleError(res, error);
  }
};

const updateRule = async (req, res) => {
  try {
    const { before, after } = await useCases.updateRule(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'AutomationRule', entityId: after._id, diff: auditService.diff(before, after), note: `Automation rule '${after.name}' updated` });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const deleteRule = async (req, res) => {
  try {
    const { before } = await useCases.deleteRule(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'AutomationRule', entityId: before._id, diff: { before }, note: `Automation rule '${before.name}' archived` });
    res.json({ success: true, data: { id: req.params.id, archived: true } });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { listRules, createRule, updateRule, deleteRule };
