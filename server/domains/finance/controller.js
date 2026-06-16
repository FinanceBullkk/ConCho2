const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// finance/controller — thin HTTP handlers (envelope + audit only) for A1.
// ──────────────────────────────────────────────────────────

const getCurrency = async (req, res) => {
  try {
    const currency = await useCases.getTenantCurrency();
    res.json({ success: true, data: { currency } });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Cost entries ─────────────────────────────────────────────────────────────
const listCostEntries = async (req, res) => {
  try {
    const data = await useCases.listCostEntries(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createCostEntry = async (req, res) => {
  try {
    const data = await useCases.createCostEntry(req.body, req.user?._id);
    auditService.record({ req, action: 'created', entity: 'CostEntry', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateCostEntry = async (req, res) => {
  try {
    const { before, after } = await useCases.updateCostEntry(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'CostEntry', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveCostEntry = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveCostEntry(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'CostEntry', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const getCostRollup = async (req, res) => {
  try {
    const data = await useCases.buildCostRollup(req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Budgets ──────────────────────────────────────────────────────────────────
const listBudgets = async (req, res) => {
  try {
    const data = await useCases.listBudgets(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createBudget = async (req, res) => {
  try {
    const data = await useCases.createBudget(req.body, req.user?._id);
    auditService.record({ req, action: 'created', entity: 'Budget', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateBudget = async (req, res) => {
  try {
    const { before, after } = await useCases.updateBudget(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'Budget', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveBudget = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveBudget(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'Budget', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const getBudgetVariance = async (req, res) => {
  try {
    const data = await useCases.buildBudgetVariance(req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getCurrency,
  listCostEntries,
  createCostEntry,
  updateCostEntry,
  archiveCostEntry,
  getCostRollup,
  listBudgets,
  createBudget,
  updateBudget,
  archiveBudget,
  getBudgetVariance,
};
