const express = require('express');
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const { validate } = require('../middleware/validate');
const { reconcileLimiter } = require('../middleware/rateLimiters');
const { mongoOnlyGone } = require('../middleware/mongoOnlyGone');
const { healBody } = require('../schemas/reconcile');
const {
  getLatestReport,
  getReportHistory,
  getReportById,
  getTrend,
  triggerRun,
  triggerHeal,
} = require('../controllers/reconcileController');

const router = express.Router();

// K1b: reconcileService is Mongo-only — retired once the app runs Mongo-less.
router.use(mongoOnlyGone);

// All reconcile endpoints are Admin-only (system.ops capability).
router.use(protect, requireCapability(CAPABILITIES.SYSTEM_OPS));

router.get('/history',  getReportHistory);  // GET  /api/admin/reconcile/history
router.get('/trend',    getTrend);          // GET  /api/admin/reconcile/trend  (before /:id)
router.get('/latest',   getLatestReport);   // GET  /api/admin/reconcile/latest
router.get('/:id',      getReportById);     // GET  /api/admin/reconcile/:id
router.post('/run',     triggerRun);        // POST /api/admin/reconcile/run
router.post('/heal', reconcileLimiter, validate({ body: healBody }), triggerHeal); // POST /api/admin/reconcile/heal

module.exports = router;
