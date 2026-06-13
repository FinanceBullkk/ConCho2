const router = require('express').Router();
const { syncFromGoogleSheets, getSyncStatus } = require('../controllers/syncController');
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const { syncLimiter } = require('../middleware/rateLimiters');

// Admin only
router.use(protect, requireCapability(CAPABILITIES.DATA_TRANSFER));

router.get('/status', getSyncStatus);
router.post('/google-sheets', syncLimiter, syncFromGoogleSheets);

module.exports = router;
