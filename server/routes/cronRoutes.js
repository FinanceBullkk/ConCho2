const express = require('express');
const { cronAuth } = require('../middleware/cronAuth');
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

// POST /api/cron/reconcile
// Fires the reconciliation suite immediately and returns the report.
router.post('/reconcile', async (req, res) => {
  try {
    const report = await runReconciliation('cron');
    res.json({ success: true, data: report });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/cron/health
// Lightweight ping so the pinger has something cheap to hit between
// real cron runs (keeps the Render dyno warm if you want that).
router.get('/health', (req, res) => {
  res.json({ success: true, data: { ts: new Date().toISOString() } });
});

module.exports = router;
