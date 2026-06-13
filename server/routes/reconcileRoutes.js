const express = require('express');
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const {
  getLatestReport,
  getReportHistory,
  getReportById,
  triggerRun,
} = require('../controllers/reconcileController');

const router = express.Router();

// All reconcile endpoints are Admin-only
router.use(protect, requireCapability(CAPABILITIES.SYSTEM_OPS));

router.get('/history',  getReportHistory);  // GET  /api/admin/reconcile/history
router.get('/latest',   getLatestReport);   // GET  /api/admin/reconcile/latest
router.get('/:id',      getReportById);     // GET  /api/admin/reconcile/:id
router.post('/run',     triggerRun);        // POST /api/admin/reconcile/run

module.exports = router;
