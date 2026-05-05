const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { cacheMiddleware } = require('../middleware/analyticsCache');
const { getDashboardStats, getFilterOptions } = require('../controllers/dashboardController');

// GET /api/dashboard/filter-options — Distinct values for filter dropdowns (cached 30min)
router.get('/filter-options', protect, roleGuard('Admin'), cacheMiddleware('dashboard:filter-options'), getFilterOptions);

// GET /api/dashboard/stats?department=X&position=Y&... — Admin analytics (cached per filter combo)
router.get('/stats', protect, roleGuard('Admin'), cacheMiddleware('dashboard:stats'), getDashboardStats);

module.exports = router;
