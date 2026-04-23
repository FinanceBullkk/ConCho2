const router = require('express').Router();
const { bulkImportUsers, bulkImportClasses } = require('../controllers/importController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { importLimiter } = require('../middleware/rateLimiters');

// Both endpoints are Admin-only + rate limited
router.post('/users',   protect, roleGuard('Admin'), importLimiter, bulkImportUsers);
router.post('/classes', protect, roleGuard('Admin'), importLimiter, bulkImportClasses);

module.exports = router;
