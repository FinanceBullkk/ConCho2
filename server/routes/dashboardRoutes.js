const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const { cacheMiddleware, invalidateAnalyticsCache, getCacheStats } = require('../middleware/analyticsCache');
const { getDashboardStats, getFilterOptions, getAlerts } = require('../controllers/dashboardController');

// GET /api/dashboard/filter-options — Distinct values for filter dropdowns (cached 60min)
router.get('/filter-options', protect, requireCapability(CAPABILITIES.ANALYTICS_READ), cacheMiddleware('dashboard:filter-options'), getFilterOptions);

// GET /api/dashboard/alerts — Actionable counts (no cache — refetchOnWindowFocus on client)
router.get('/alerts', protect, requireCapability(CAPABILITIES.ANALYTICS_READ), getAlerts);

// GET /api/dashboard/stats?department=X&position=Y&... — Admin analytics (cached per filter combo)
router.get('/stats', protect, requireCapability(CAPABILITIES.ANALYTICS_READ), cacheMiddleware('dashboard:stats'), getDashboardStats);

// GET /api/dashboard/cache/stats — show hit rate, key count (Admin)
router.get('/cache/stats', protect, requireCapability(CAPABILITIES.ANALYTICS_READ), (_req, res) => {
  res.json({ success: true, data: getCacheStats() });
});

// POST /api/dashboard/cache/invalidate — manual flush (Admin)
router.post('/cache/invalidate', protect, requireCapability(CAPABILITIES.ANALYTICS_READ), (_req, res) => {
  invalidateAnalyticsCache();
  res.json({ success: true, message: 'Dashboard cache cleared. Next request will run fresh queries.' });
});

module.exports = router;
