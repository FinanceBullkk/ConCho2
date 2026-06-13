const router = require('express').Router();
const { exportAttendance, exportEvaluations, getExportStats } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const { exportLimiter } = require('../middleware/rateLimiters');

// Admin-only endpoints
router.use(protect, requireCapability(CAPABILITIES.DATA_TRANSFER));

// GET /api/export/stats — count of PENDING vs EXPORTED
router.get('/stats', getExportStats);

// GET /api/export/attendance — download Excel or JSON preview
router.get('/attendance', exportLimiter, exportAttendance);

// GET /api/export/evaluations — download Excel or JSON preview (re-exportable)
router.get('/evaluations', exportLimiter, exportEvaluations);

module.exports = router;
