const express = require('express');
const router = express.Router();
const { bulkImportUsers, bulkImportClasses, bulkImportHistory } = require('../controllers/importController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { importLimiter } = require('../middleware/rateLimiters');
const { validate } = require('../middleware/validate');
const { importUsersBody, importClassesBody } = require('../schemas/import');

// Both endpoints are Admin-only + rate limited + validated
router.post('/users',   protect, roleGuard('Admin'), importLimiter, validate({ body: importUsersBody }), bulkImportUsers);
router.post('/classes', protect, roleGuard('Admin'), importLimiter, validate({ body: importClassesBody }), bulkImportClasses);

// Historical data import — Admin-only, larger payload for bulk migration
router.post('/history', protect, roleGuard('Admin'), express.json({ limit: '5mb' }), bulkImportHistory);

module.exports = router;
