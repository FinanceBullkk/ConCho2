const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { cacheMiddleware } = require('../middleware/analyticsCache');
const { getDashboardStats } = require('../controllers/dashboardController');

// GET /api/dashboard/stats — Admin analytics dashboard (cached 30min)
router.get('/stats', protect, roleGuard('Admin'), cacheMiddleware('dashboard:stats'), getDashboardStats);

module.exports = router;
