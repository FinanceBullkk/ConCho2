const cron = require('node-cron');
const { runReconciliation } = require('../services/reconcileService');
const auditService = require('../services/auditService');
const { runMonitored, CRON_JOBS } = require('../lib/cronMonitor');
const { isPostgres } = require('../config/db-backend');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Reconciliation Cron Job
// ──────────────────────────────────────────────────────────
// Runs nightly at 02:00 UTC — low-traffic window.
//
// IMPORTANT for Render free tier:
//   Render spins down services after 15 min of inactivity,
//   so this cron only fires when the process is already awake.
//   Use the manual endpoint POST /api/admin/reconcile/run to
//   trigger a run on-demand regardless of sleep state.
//   For guaranteed nightly runs, upgrade to a Render paid plan
//   (always-on) or add a Render Cron Job resource that makes
//   an HTTP request to the run endpoint.
//
// Schedule syntax: second(opt) minute hour day month weekday
//   '0 2 * * *' = 02:00 every day (UTC)
// ──────────────────────────────────────────────────────────

const CRON_SCHEDULE = process.env.RECONCILE_CRON || '0 2 * * *';

// Audit PR 10 (OPS-005): hold a handle to the running task so the
// SIGTERM path can stop it cleanly. Without this the worker keeps
// firing on the next tick after process.exit was scheduled, which
// occasionally leaves Mongo connections in a half-closed state.
let task = null;

function startReconcileJob() {
  if (process.env.NODE_ENV === 'test') return; // never run in test

  // K1b: reconcileService is Mongo-only (no PG implementation) — retired at the
  // PostgreSQL cutover. Don't schedule it under DB_BACKEND=postgres.
  if (isPostgres) {
    logger.info('Reconciliation cron job skipped — reconcileService is Mongo-only (retired under postgres)');
    return;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.warn({ schedule: CRON_SCHEDULE }, 'Invalid RECONCILE_CRON expression — job not started');
    return;
  }

  task = cron.schedule(CRON_SCHEDULE, async () => {
    logger.info({ schedule: CRON_SCHEDULE }, 'Reconciliation cron fired');
    try {
      // Self-monitoring: heartbeat (CronRun) + Sentry cron check-in. Fail-soft —
      // the actual reconcile result/error still flows through to the audit logic below.
      const report = await runMonitored(
        CRON_JOBS.reconcile.jobName,
        { ...CRON_JOBS.reconcile, schedule: CRON_SCHEDULE },
        () => runReconciliation('scheduled')
      );

      // SEC-013: audit-log the scheduled reconcile run
      // auditService.record() accepts undefined req — defaults to actorRole: 'System'
      await auditService.record({
        req: undefined,
        action: 'reconciled',
        entity: 'Reconcile',
        entityId: report?._id || null,
        note: `scheduled run — status=${report?.status}, total issues=${report?.summary?.total ?? '?'}`,
      });
    } catch (err) {
      logger.error({ err }, 'Reconciliation cron job failed');

      // Audit-log the failure too for compliance
      await auditService.record({
        req: undefined,
        action: 'reconcile-failed',
        entity: 'Reconcile',
        entityId: null,
        note: `scheduled run failed — ${err.message}`,
      }).catch(() => {}); // swallow audit errors so they don't mask the original failure
    }
  }, {
    timezone: 'UTC',
  });

  logger.info({ schedule: CRON_SCHEDULE }, 'Reconciliation cron job scheduled');
}

/**
 * Stop the in-process cron task (called from server.js shutdown handler).
 * Safe to call multiple times or when the task was never started.
 */
function stopReconcileJob() {
  if (!task) return;
  try {
    // node-cron exposes .stop(); some versions also have .destroy()
    if (typeof task.stop === 'function') task.stop();
    if (typeof task.destroy === 'function') task.destroy();
  } finally {
    task = null;
  }
  logger.info('Reconciliation cron job stopped');
}

module.exports = { startReconcileJob, stopReconcileJob };
