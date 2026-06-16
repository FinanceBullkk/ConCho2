const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const {
  createRequestBody, listRequestsQuery, statusBody, demandQuery,
  upsertPlanBody, scheduleItemBody, fyParam, itemParams,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// Planning routes (A4, Horizon 2) — mounted at /api/planning.
// Training Needs Analysis: demand intake → aggregation → costed annual plan →
// scheduled cohorts. Gated by the new training.plan capability (Admin +
// Coordinator — a training-ops planning function). Every mutation audited.
// (Manager self-service intake is a documented follow-up — see the spec.)
// ──────────────────────────────────────────────────────────

router.use(protect);
const plan = requireCapability('training.plan');

// Demand intake + status machine
router.post('/requests', plan, validate({ body: createRequestBody }), controller.createRequest);
router.get('/requests', plan, validate({ query: listRequestsQuery }), controller.listRequests);
router.patch('/requests/:id/status', plan, validate({ params: idParam, body: statusBody }), controller.updateRequestStatus);
router.delete('/requests/:id', plan, validate({ params: idParam }), controller.archiveRequest);

// Aggregated demand
router.get('/demand', plan, validate({ query: demandQuery }), controller.getDemand);

// Annual plan + scheduling a plan item into a cohort
router.get('/plan/:fiscalYear', plan, validate({ params: fyParam }), controller.getPlan);
router.put('/plan/:fiscalYear', plan, validate({ params: fyParam, body: upsertPlanBody }), controller.upsertPlan);
router.post('/plan/:fiscalYear/items/:itemId/schedule', plan, validate({ params: itemParams, body: scheduleItemBody }), controller.scheduleItem);

module.exports = router;
