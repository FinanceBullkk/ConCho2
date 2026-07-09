const { Sentry, isEnabled } = require('./sentry');
const logger = require('./logger');
// Phase-5 D-CronRun: heartbeat rows ride the dual-backend seam (Mongo or PG by
// DB_BACKEND) — a raw Mongoose write here would land in a dead Mongo at cutover.
const cronRunRepo = require('./cron-run-repository');

// ──────────────────────────────────────────────────────────
// Cron Monitor — production-readiness self-monitoring for cron jobs.
//
// `runMonitored(jobName, options, fn)` wraps any cron/scheduled job and:
//   1. Persists a heartbeat (CronRun) — last run time, status, duration,
//      error, success time, lifetime counters. Durable across restarts.
//   2. Emits Sentry cron check-ins (in_progress → ok/error) so a missed
//      or failing run pages someone, and reports the exception.
//
// Both side-channels are FAIL-SOFT: a heartbeat-write or Sentry failure
// must never break (or mask) the underlying job. The job's own result and
// errors pass through untouched — runMonitored returns fn()'s value and
// re-throws fn()'s error after recording it.
// ──────────────────────────────────────────────────────────

// A job that has not SUCCEEDED within this multiple of its expected
// interval is considered stale (allows one missed run + slack before alarm).
const STALE_FACTOR = 2;

const HOUR_MS = 60 * 60 * 1000;

// Shared cron-job metadata — single source of truth so the in-process
// scheduler and the external-pinger endpoints (routes/cronRoutes.js) monitor
// the SAME job under the SAME slug/cadence.
//
// OPS-010: each entry carries its crontab `schedule` so a PINGER-driven run
// also upserts the Sentry monitor config — without it the monitor auto-creates
// schedule-less and can never fire "missed run" alerts. Cadences mirror
// docs/cron-pinger-setup.md.
const CRON_JOBS = {
  reminders: {
    jobName: 'attendance-reminders',
    monitorSlug: 'attendance-reminders',
    expectedIntervalMs: HOUR_MS, // pinged hourly
    schedule: '0 * * * *',
  },
  assignmentReminders: {
    jobName: 'assignment-reminders',
    monitorSlug: 'assignment-reminders',
    expectedIntervalMs: 24 * HOUR_MS, // daily
    schedule: '0 1 * * *', // 01:00 UTC = 08:00 ICT
  },
  certificateExpiry: {
    jobName: 'certificate-expiry-reminders',
    monitorSlug: 'certificate-expiry-reminders',
    expectedIntervalMs: 24 * HOUR_MS, // daily
    schedule: '30 1 * * *', // 01:30 UTC = 08:30 ICT (just after assignment reminders)
  },
  snapshot: {
    jobName: 'metric-snapshot',
    monitorSlug: 'metric-snapshot',
    expectedIntervalMs: 24 * HOUR_MS, // nightly analytics rollup
    schedule: '0 1 * * *', // 01:00 UTC = 08:00 ICT
  },
  retentionPurge: {
    jobName: 'retention-purge',
    monitorSlug: 'retention-purge',
    expectedIntervalMs: 24 * HOUR_MS, // nightly PG retention DELETE (Wave-E2)
    schedule: '30 2 * * *', // 02:30 UTC — after the 02:00 reconcile
  },
};

// The fail-soft try/catch lives HERE (not in the repository impls) so the
// parity test can assert the impls' real errors while a heartbeat-write
// failure still never breaks (or masks) the job being monitored.
async function recordStart(jobName) {
  try {
    await cronRunRepo.upsertStart(jobName, new Date());
  } catch (err) {
    logger.warn({ err: err.message, jobName }, 'cronMonitor: heartbeat start write failed');
  }
}

async function recordEnd(jobName, { status, durationMs, error, expectedIntervalMs }) {
  try {
    await cronRunRepo.upsertEnd(jobName, {
      status, finishedAt: new Date(), durationMs, error, expectedIntervalMs,
    });
  } catch (err) {
    logger.warn({ err: err.message, jobName }, 'cronMonitor: heartbeat end write failed');
  }
}

function sentryCheckIn(payload, monitorConfig) {
  if (!isEnabled()) return undefined;
  try {
    return Sentry.captureCheckIn(payload, monitorConfig);
  } catch (err) {
    logger.warn({ err: err.message, slug: payload.monitorSlug }, 'cronMonitor: sentry check-in failed');
    return undefined;
  }
}

/**
 * Run a job under heartbeat + Sentry monitoring.
 *
 * @param {string} jobName    stable id, e.g. 'reconcile'
 * @param {object} options
 * @param {string} [options.monitorSlug]        Sentry monitor slug (default jobName)
 * @param {number} [options.expectedIntervalMs] cadence for staleness detection
 * @param {string} [options.schedule]           crontab string, upserts the Sentry monitor config
 * @param {Function} fn       the actual job (sync or async). Its result is returned.
 */
async function runMonitored(jobName, options, fn) {
  const { monitorSlug = jobName, expectedIntervalMs, schedule } = options || {};
  const startedAt = Date.now();

  await recordStart(jobName);

  const checkInId = sentryCheckIn(
    { monitorSlug, status: 'in_progress' },
    schedule ? { schedule: { type: 'crontab', value: schedule } } : undefined
  );

  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    await recordEnd(jobName, { status: 'ok', durationMs, expectedIntervalMs });
    sentryCheckIn({ checkInId, monitorSlug, status: 'ok', duration: durationMs / 1000 });
    return result;
  } catch (jobErr) {
    const durationMs = Date.now() - startedAt;
    await recordEnd(jobName, { status: 'error', durationMs, error: jobErr.message, expectedIntervalMs });
    sentryCheckIn({ checkInId, monitorSlug, status: 'error', duration: durationMs / 1000 });
    if (isEnabled()) {
      try { Sentry.captureException(jobErr); } catch { /* fail-soft */ }
    }
    throw jobErr;
  }
}

/**
 * Derive an at-a-glance health verdict for one CronRun heartbeat.
 * Pure — used by the admin health endpoint and unit-testable in isolation.
 *
 * health: 'ok' | 'error' | 'stale' | 'never'
 *   - never : has never finished a successful run
 *   - error : the latest run threw
 *   - stale : no success within STALE_FACTOR × expectedIntervalMs
 *   - ok    : recent success
 */
function deriveHealth(run, now = Date.now()) {
  const lastSuccessMs = run.lastSuccessAt ? new Date(run.lastSuccessAt).getTime() : null;

  let staleThresholdMs = null;
  let stale = false;
  if (run.expectedIntervalMs) {
    staleThresholdMs = run.expectedIntervalMs * STALE_FACTOR;
    stale = lastSuccessMs == null || now - lastSuccessMs > staleThresholdMs;
  }

  let health;
  if (lastSuccessMs == null && run.lastStatus !== 'error') health = 'never';
  else if (run.lastStatus === 'error') health = 'error';
  else if (stale) health = 'stale';
  else health = 'ok';

  return {
    health,
    stale,
    healthy: health === 'ok',
    staleThresholdMs,
  };
}

module.exports = { runMonitored, deriveHealth, STALE_FACTOR, CRON_JOBS };
