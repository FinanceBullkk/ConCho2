const cron = require('node-cron');
const { runReconciliation } = require('../services/reconcileService');
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

function startReconcileJob() {
  if (process.env.NODE_ENV === 'test') return; // never run in test

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.warn({ schedule: CRON_SCHEDULE }, 'Invalid RECONCILE_CRON expression — job not started');
    return;
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    logger.info({ schedule: CRON_SCHEDULE }, 'Reconciliation cron fired');
    try {
      await runReconciliation('scheduled');
    } catch (err) {
      logger.error({ err }, 'Reconciliation cron job failed');
    }
  }, {
    timezone: 'UTC',
  });

  logger.info({ schedule: CRON_SCHEDULE }, 'Reconciliation cron job scheduled');
}

module.exports = { startReconcileJob };
