const express = require('express');
const { cronAuth } = require('../middleware/cronAuth');
const { reconcileLimiter } = require('../middleware/rateLimiters');
const { runReconciliation } = require('../services/reconcileService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Cron Routes — token-authed endpoints for external pingers
// ──────────────────────────────────────────────────────────
// Render's free tier sleeps idle services, so node-cron schedules
// inside the process don't fire reliably. This namespace lets a
// service like cron-job.org wake the dyno on a schedule and trigger
// the same jobs that would otherwise run in-process.
//
// Auth: every route is protected by cronAuth (CRON_TOKEN shared secret).
// ──────────────────────────────────────────────────────────

const router = express.Router();

router.use(cronAuth);

/**
 * @openapi
 * /cron/reconcile:
 *   post:
 *     tags: [Cron]
 *     summary: Trigger reconciliation suite (called by external cron service)
 *     security:
 *       - cronToken: []
 *     responses:
 *       200:
 *         description: Reconciliation report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { $ref: '#/components/schemas/ReconcileReport' }
 *       401:
 *         description: Invalid cron token
 */
// POST /api/cron/reconcile
// Fires the reconciliation suite immediately and returns the report.
router.post('/reconcile', reconcileLimiter, async (req, res) => {
  try {
    const report = await runReconciliation('scheduled');
    res.json({ success: true, data: report });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * @openapi
 * /cron/health:
 *   get:
 *     tags: [Cron]
 *     summary: Keep-warm ping — cheap health check for external pingers
 *     security:
 *       - cronToken: []
 *     responses:
 *       200:
 *         description: Service alive
 *       401:
 *         description: Invalid cron token
 *       503:
 *         description: CRON_TOKEN not configured on server
 */
// GET /api/cron/health
// Lightweight ping so the pinger has something cheap to hit between
// real cron runs (keeps the Render dyno warm if you want that).
router.get('/health', (req, res) => {
  res.json({ success: true, data: { ts: new Date().toISOString() } });
});

module.exports = router;
