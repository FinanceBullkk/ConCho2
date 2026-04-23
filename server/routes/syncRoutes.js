const router = require('express').Router();
const { syncFromGoogleSheets, getSyncStatus } = require('../controllers/syncController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { syncLimiter } = require('../middleware/rateLimiters');

// Admin only
router.use(protect, roleGuard('Admin'));

router.get('/status', getSyncStatus);
router.post('/google-sheets', syncLimiter, syncFromGoogleSheets);

module.exports = router;
