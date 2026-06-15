const cron = require('node-cron');
const { takeDailySnapshot } = require('../services/metricSnapshotService');
const { runMonitored, CRON_JOBS } = require('../lib/cronMonitor');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Metric Snapshot Cron Job (Investment Build Plan #1)
// ──────────────────────────────────────────────────────────
// Nightly at 01:00 UTC: roll up today's funnel metrics (global + per-program)
// into one durable MetricSnapshot row each, so analytics trend lines reflect
// real history. Self-monitored via cronMonitor (heartbeat + Sentry check-in).
//
// Render free-tier caveat mirrors reconcileJob: the cron only fires when the
// process is awake. Re-running a day is idempotent (upsert by scope+key+date).
// ──────────────────────────────────────────────────────────

const CRON_SCHEDULE = process.env.SNAPSHOT_CRON || '0 1 * * *';

let task = null;

function startSnapshotJob() {
  if (process.env.NODE_ENV === 'test') return; // never run in test

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.warn({ schedule: CRON_SCHEDULE }, 'Invalid SNAPSHOT_CRON expression — job not started');
    return;
  }

  task = cron.schedule(CRON_SCHEDULE, async () => {
    logger.info({ schedule: CRON_SCHEDULE }, 'Metric snapshot cron fired');
    try {
      const result = await runMonitored(
        CRON_JOBS.snapshot.jobName,
        { ...CRON_JOBS.snapshot, schedule: CRON_SCHEDULE },
        () => takeDailySnapshot(),
      );
      logger.info({ result }, 'Metric snapshot written');
    } catch (err) {
      logger.error({ err }, 'Metric snapshot cron job failed');
    }
  }, {
    timezone: 'UTC',
  });

  logger.info({ schedule: CRON_SCHEDULE }, 'Metric snapshot cron job scheduled');
}

function stopSnapshotJob() {
  if (!task) return;
  try {
    if (typeof task.stop === 'function') task.stop();
    if (typeof task.destroy === 'function') task.destroy();
  } finally {
    task = null;
  }
  logger.info('Metric snapshot cron job stopped');
}

module.exports = { startSnapshotJob, stopSnapshotJob };
