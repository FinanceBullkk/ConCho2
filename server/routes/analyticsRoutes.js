const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const { cacheMiddleware } = require('../middleware/analyticsCache');
const { handleError } = require('../helpers/handleError');
const series = require('../services/analyticsSeriesService');

// ──────────────────────────────────────────────────────────
// Analytics time-series API (Investment Build Plan #1)
// ──────────────────────────────────────────────────────────
// Real trend lines + funnel, backed by the durable MetricSnapshot history.
// Gated by analytics.read; reads are cached (reuses the analytics cache).
// ──────────────────────────────────────────────────────────

router.use(protect, requireCapability(CAPABILITIES.ANALYTICS_READ));

/**
 * GET /api/analytics/series?key=&scope=global|program&scopeId=&range=90d
 * Trend for one metric. `collecting:true` when no history has landed yet so the
 * client shows "collecting data" instead of an empty/fake line.
 */
router.get('/series', cacheMiddleware('analytics:series'), async (req, res) => {
  try {
    const { key, scope, scopeId, range } = req.query;
    if (!key) {
      return res.status(400).json({ success: false, message: 'query param "key" is required' });
    }
    const data = await series.getSeries({ key, scope, scopeId: scopeId || null, range });
    res.json({
      success: true,
      data,
      meta: {
        key,
        scope: scope || 'global',
        scopeId: scopeId || null,
        range: range || '90d',
        collecting: data.length === 0,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * GET /api/analytics/funnel?programId=
 * Live enroll → complete → certify funnel (whole org or one program).
 */
router.get('/funnel', cacheMiddleware('analytics:funnel'), async (req, res) => {
  try {
    const data = await series.getFunnel({ programId: req.query.programId || null });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * GET /api/analytics/program/:id?range=90d
 * Per-program Analytics tab: stored trend series + live funnel.
 * (Spec path was /api/programs/:id/analytics; kept under /api/analytics for
 * domain cohesion — all analytics live behind one analytics.read router.)
 */
router.get('/program/:id', cacheMiddleware('analytics:program'), async (req, res) => {
  try {
    const data = await series.getProgramAnalytics(req.params.id, req.query.range);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
