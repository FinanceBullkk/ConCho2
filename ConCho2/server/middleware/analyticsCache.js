const NodeCache = require('node-cache');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Analytics Cache Service
// ──────────────────────────────────────────────────────────
// In-memory cache for expensive aggregation pipelines.
//
// WHY node-cache instead of Redis?
//   - Single-server MERN app → no need for shared cache
//   - Zero infrastructure overhead (no Redis container)
//   - If you scale to multiple servers later, swap this file
//     to use ioredis with the exact same API surface.
//
// HOW IT WORKS:
//   1. cacheMiddleware(prefix) wraps any Express GET handler.
//      It builds a cache key from the route + query params.
//   2. On HIT  → sends cached JSON directly (skips controller).
//   3. On MISS → lets the controller run, intercepts res.json()
//      to capture the response, stores it, then sends it.
//   4. invalidateAnalyticsCache() flushes all analytics keys.
//      Called after bulkMarkAttendance writes new data.
//
// TTL: 30 minutes (1800 seconds).
// ──────────────────────────────────────────────────────────

// TTL is configurable via DASHBOARD_CACHE_TTL_MINUTES (default 60 min).
// Longer TTL is safe because all write controllers now call
// invalidateAnalyticsCache() so the cache never serves truly stale data —
// it only ages out as a safety net.
const ANALYTICS_TTL = Number(process.env.DASHBOARD_CACHE_TTL_MINUTES || 60) * 60;

const cache = new NodeCache({
  stdTTL: ANALYTICS_TTL,
  checkperiod: 120,       // Check for expired keys every 2 min
  useClones: false,       // Perf: skip deep-copy — data goes straight to res.json()
});

/**
 * Express middleware factory.
 * Caches the JSON response of the wrapped route handler.
 *
 * @param {string} prefix  A namespace prefix for the cache key
 *                         (e.g. 'analytics:by-employee')
 * @returns {Function}     Express middleware
 *
 * @example
 *   router.get('/analytics/by-employee',
 *     protect,
 *     cacheMiddleware('analytics:by-employee'),
 *     getAnalyticsByEmployee
 *   );
 */
const cacheMiddleware = (prefix) => {
  return (req, res, next) => {
    // Build a unique key from prefix + sorted query params
    // e.g. "analytics:by-class?classId=abc123"
    const queryString = Object.keys(req.query)
      .sort()
      .map(k => `${k}=${req.query[k]}`)
      .join('&');
    const key = queryString ? `${prefix}?${queryString}` : prefix;

    // ── Cache HIT ─────────────────────────────────────────
    const cached = cache.get(key);
    if (cached) {
      // Add header so the frontend/dev can see it was cached
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // ── Cache MISS ────────────────────────────────────────
    // Monkey-patch res.json() to intercept the response body
    // BEFORE it's sent to the client, store it in cache, then
    // send it normally.
    res.set('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, body);
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Flush all analytics cache entries.
 * Call this after any write that changes attendance data
 * (e.g. bulkMarkAttendance, attendance delete, etc.)
 *
 * Uses prefix-based deletion: any key starting with "analytics:"
 * gets removed, while other cached data (if any) is preserved.
 */
const invalidateAnalyticsCache = () => {
  const keys = cache.keys();
  const analyticsKeys = keys.filter(k => k.startsWith('analytics:') || k.startsWith('dashboard:'));
  if (analyticsKeys.length > 0) {
    cache.del(analyticsKeys);
    logger.debug({ keys: analyticsKeys.length }, 'Analytics cache invalidated');
  }
};

/**
 * Get cache stats for debugging/monitoring.
 * @returns {{ keys: number, hits: number, misses: number, hitRate: string }}
 */
const getCacheStats = () => {
  const stats = cache.getStats();
  const total = stats.hits + stats.misses;
  return {
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total > 0 ? `${((stats.hits / total) * 100).toFixed(1)}%` : 'N/A',
  };
};

module.exports = { cacheMiddleware, invalidateAnalyticsCache, getCacheStats };
