const router = require('express').Router();
const { exportAttendance, getExportStats } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Admin-only endpoints
router.use(protect, roleGuard('Admin'));

// GET /api/export/stats — count of PENDING vs EXPORTED
router.get('/stats', getExportStats);

// GET /api/export/attendance — download Excel or JSON preview
router.get('/attendance', exportAttendance);

module.exports = router;
