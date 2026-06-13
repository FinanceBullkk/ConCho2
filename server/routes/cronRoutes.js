const express = require('express');
const { cronAuth } = require('../middleware/cronAuth');
const { reconcileLimiter } = require('../middleware/rateLimiters');
const { runReconciliation } = require('../services/reconcileService');
const { sendUpcomingReminders } = require('../services/reminderService');
const { sendAssignmentReminders } = require('../domains/learning/assignment/reminder-service');
const { sendCertificateExpiryReminders } = require('../domains/learning/completion/expiry-reminder-service');
const { runMonitored, CRON_JOBS } = require('../lib/cronMonitor');
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
// Fires the reconciliation suite immediately and returns a compact summary.
// Full report is logged server-side; we return only the summary so the
// response stays under cron-job.org's ~4 KB output limit.
router.post('/reconcile', reconcileLimiter, async (req, res) => {
  try {
    // Monitored so an external-pinger-driven run also updates the heartbeat
    // and Sentry cron check-in (same job/slug as the in-process scheduler).
    const report = await runMonitored(
      CRON_JOBS.reconcile.jobName,
      CRON_JOBS.reconcile,
      () => runReconciliation('scheduled')
    );
    const { summary, ranAt, triggeredBy } = report;
    res.json({ success: true, data: { summary, ranAt, triggeredBy } });
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

/**
 * @openapi
 * /cron/attendance-reminders:
 *   post:
 *     tags: [Cron]
 *     summary: Send reminder emails for upcoming sessions (next 24h)
 *     description: |
 *       Idempotent — each schedule is reminded at most once. Safe to call
 *       hourly from an external pinger. Returns { scanned, notified, emailed }.
 *     security:
 *       - cronToken: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema: { type: integer, minimum: 1, maximum: 168 }
 *         description: Lookahead window in hours (default 24)
 *     responses:
 *       200: { description: Reminder run summary }
 *       401: { description: Invalid cron token }
 */
// POST /api/cron/attendance-reminders
router.post('/attendance-reminders', async (req, res) => {
  try {
    const lookaheadHours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const summary = await runMonitored(
      CRON_JOBS.reminders.jobName,
      CRON_JOBS.reminders,
      () => sendUpcomingReminders({ lookaheadHours })
    );
    res.json({ success: true, data: summary });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * @openapi
 * /cron/assignment-reminders:
 *   post:
 *     tags: [Cron]
 *     summary: Send assignment due-date reminder and manager escalation emails
 *     description: |
 *       Idempotent by NotificationLog cadence keys. Safe to call daily from an
 *       external pinger. Runtime clock injection is service-level only for tests.
 *     security:
 *       - cronToken: []
 *     responses:
 *       200: { description: Assignment reminder run summary }
 *       401: { description: Invalid cron token }
 */
// POST /api/cron/assignment-reminders
router.post('/assignment-reminders', async (req, res) => {
  try {
    const summary = await runMonitored(
      CRON_JOBS.assignmentReminders.jobName,
      CRON_JOBS.assignmentReminders,
      () => sendAssignmentReminders()
    );
    res.json({ success: true, data: summary });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * @openapi
 * /cron/certificate-expiry-reminders:
 *   post:
 *     tags: [Cron]
 *     summary: Email learners whose certificates are about to expire (recertification)
 *     description: |
 *       Idempotent by NotificationLog cadence keys (`<certNumber>:expiry_30|7`).
 *       Safe to call daily from an external pinger. Also surfaces the notice in
 *       the in-app notification bell.
 *     security:
 *       - cronToken: []
 *     responses:
 *       200: { description: Certificate expiry reminder run summary }
 *       401: { description: Invalid cron token }
 */
// POST /api/cron/certificate-expiry-reminders
router.post('/certificate-expiry-reminders', async (req, res) => {
  try {
    const summary = await runMonitored(
      CRON_JOBS.certificateExpiry.jobName,
      CRON_JOBS.certificateExpiry,
      () => sendCertificateExpiryReminders()
    );
    res.json({ success: true, data: summary });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
