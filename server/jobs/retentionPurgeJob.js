const cron = require('node-cron');
const { isPostgres } = require('../config/db-backend');
const { query } = require('../config/pg');
const { runMonitored, CRON_JOBS } = require('../lib/cronMonitor');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// PG Retention Purge Cron Job (Phase 3 Wave-E slice E2)
// ──────────────────────────────────────────────────────────
// Mongo enforces data retention declaratively — TTL indexes on the models.
// Postgres has no native TTL, so this nightly job DELETEs expired rows: the
// debt explicitly deferred to Wave E by migs 002/019 (and noted in 029).
//
// The windows mirror the Mongo TTL definitions field-for-field — SAME env var
// and default as each model. If a model's TTL changes, change it here too:
//   audit_log.created_at         — AUDIT_RETENTION_DAYS (730)          ⇔ models/AuditLog
//   notification_logs.created_at — fixed 180                           ⇔ models/NotificationLog
//   metric_snapshots.date        — METRIC_SNAPSHOT_RETENTION_DAYS (400) ⇔ models/MetricSnapshot
//   token_blocklist.expires_at   — days 0 (< now)                      ⇔ models/TokenBlocklist
//                                  (TTL expireAfterSeconds: 0 — mig 033, Phase-5 slice 2)
//
// NOT here: reconcile_report — reconcile RETIRES at cutover (owner decision
// 2026-07-07, phase-05 plan); it never gets a PG table.
//
// Runs ONLY when DB_BACKEND=postgres — on Mongo the TTL indexes do the work.
// Purge deletions are NOT audited, matching Mongo TTL deletions (automatic
// retention, not an actor mutation); row counts go to the structured log.
// ──────────────────────────────────────────────────────────

const CRON_SCHEDULE = process.env.RETENTION_PURGE_CRON || '30 2 * * *'; // 02:30 UTC

// Windows are read at CALL time (not module load) so a changed env applies on
// the next run — and so tests can override without a module reset.
const retentionWindows = () => [
  { table: 'audit_log', column: 'created_at', days: Number(process.env.AUDIT_RETENTION_DAYS || 730) },
  { table: 'notification_logs', column: 'created_at', days: 180 },
  { table: 'metric_snapshots', column: 'date', days: Number(process.env.METRIC_SNAPSHOT_RETENTION_DAYS || 400) },
  // TokenBlocklist TTL is expireAfterSeconds: 0 → prune as soon as the JWT
  // itself has expired (expires_at < now). Expired-but-unpurged rows are
  // unobservable: JWT verify rejects the token before the blocklist lookup.
  { table: 'token_blocklist', column: 'expires_at', days: 0 },
];

/**
 * Delete rows past their retention window on every purge-managed PG table.
 * Table/column names are the code-owned constants above — never user input.
 * @returns {Promise<Object>} rows deleted per table, e.g. { audit_log: 12, … }
 */
const purgeExpiredRows = async () => {
  const deleted = {};
  for (const { table, column, days } of retentionWindows()) {
    const res = await query(
      `DELETE FROM ${table} WHERE ${column} < now() - make_interval(days => $1)`,
      [days]
    );
    deleted[table] = res.rowCount;
  }
  return deleted;
};

let task = null;

function startRetentionPurgeJob() {
  if (process.env.NODE_ENV === 'test') return; // never run in test

  if (!isPostgres) {
    logger.info('Retention purge job not started — DB_BACKEND=mongo (TTL indexes handle retention)');
    return;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.warn({ schedule: CRON_SCHEDULE }, 'Invalid RETENTION_PURGE_CRON expression — job not started');
    return;
  }

  task = cron.schedule(CRON_SCHEDULE, async () => {
    logger.info({ schedule: CRON_SCHEDULE }, 'Retention purge cron fired');
    try {
      const result = await runMonitored(
        CRON_JOBS.retentionPurge.jobName,
        { ...CRON_JOBS.retentionPurge, schedule: CRON_SCHEDULE },
        () => purgeExpiredRows(),
      );
      logger.info({ result }, 'Retention purge completed');
    } catch (err) {
      logger.error({ err }, 'Retention purge cron job failed');
    }
  }, {
    timezone: 'UTC',
  });

  logger.info({ schedule: CRON_SCHEDULE }, 'Retention purge cron job scheduled');
}

function stopRetentionPurgeJob() {
  if (!task) return;
  try {
    if (typeof task.stop === 'function') task.stop();
    if (typeof task.destroy === 'function') task.destroy();
  } finally {
    task = null;
  }
  logger.info('Retention purge cron job stopped');
}

module.exports = {
  startRetentionPurgeJob,
  stopRetentionPurgeJob,
  purgeExpiredRows,
  retentionWindows,
};
