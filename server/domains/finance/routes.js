const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const {
  createCostEntryBody, updateCostEntryBody, costListQuery, costRollupQuery,
  createBudgetBody, updateBudgetBody, budgetListQuery, budgetVarianceQuery,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// Finance routes (A1, Horizon 1) — mounted at /api/finance.
// BOTH read and write require budget.manage (Admin + Coordinator): budget
// figures are management-sensitive, so reads deliberately do NOT roll into the
// broader report.read (which Teachers hold). Every mutation is audited.
// More-specific GETs (/costs/rollup, /budgets/variance) are declared before the
// :id routes so they never get shadowed.
// ──────────────────────────────────────────────────────────

router.use(protect);

const manage = requireCapability('budget.manage');

router.get('/currency', manage, controller.getCurrency);

// ── Cost entries ──
router.get('/costs/rollup', manage, validate({ query: costRollupQuery }), controller.getCostRollup);
router.get('/costs', manage, validate({ query: costListQuery }), controller.listCostEntries);
router.post('/costs', manage, validate({ body: createCostEntryBody }), controller.createCostEntry);
router.put('/costs/:id', manage, validate({ params: idParam, body: updateCostEntryBody }), controller.updateCostEntry);
router.delete('/costs/:id', manage, validate({ params: idParam }), controller.archiveCostEntry);

// ── Budgets ──
router.get('/budgets/variance', manage, validate({ query: budgetVarianceQuery }), controller.getBudgetVariance);
router.get('/budgets', manage, validate({ query: budgetListQuery }), controller.listBudgets);
router.post('/budgets', manage, validate({ body: createBudgetBody }), controller.createBudget);
router.put('/budgets/:id', manage, validate({ params: idParam, body: updateBudgetBody }), controller.updateBudget);
router.delete('/budgets/:id', manage, validate({ params: idParam }), controller.archiveBudget);

module.exports = router;
