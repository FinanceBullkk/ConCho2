const router = require('express').Router();
const { bulkImportUsers, bulkImportClasses } = require('../controllers/importController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Both endpoints are Admin-only
router.post('/users',   protect, roleGuard('Admin'), bulkImportUsers);
router.post('/classes', protect, roleGuard('Admin'), bulkImportClasses);

module.exports = router;
