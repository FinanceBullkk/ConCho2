const crypto = require('crypto');
const { query } = require('../config/pg');

// cron-run-repository — POSTGRES impl (mig 035). Same interface as
// ./cron-run-repository.mongo.
//
// Fidelity notes the parity test pins:
//   • upsert keys on job_name — ON CONFLICT (job_name) DO UPDATE ⇔ the Mongo
//     upsert; the fresh `id` param is discarded on conflict (row keeps its id).
//   • last_success_at / expected_interval_ms use COALESCE ⇔ the Mongo
//     conditional-$set (an error run PRESERVES the previous success stamp; a
//     run without a cadence never clears a stored one).
//   • last_error is direct-assigned ⇔ $set — an 'ok' run clears a prior error.
//   • run_count/fail_count increment on the conflict branch ⇔ $inc; the
//     insert branch seeds them (1 / 0-or-1) ⇔ $inc-on-upsert-insert.
//   • expected_interval_ms is bigint → node-pg returns a string → Number()
//     on read (same convention as helpers/counter.js).

const newId = () => crypto.randomBytes(12).toString('hex'); // ObjectId-hex shaped

const upsertStart = async (jobName, startedAt) => {
  await query(
    `INSERT INTO cron_runs (id, job_name, last_status, last_started_at)
     VALUES ($1, $2, 'running', $3)
     ON CONFLICT (job_name) DO UPDATE
       SET last_status = 'running',
           last_started_at = EXCLUDED.last_started_at,
           updated_at = now()`,
    [newId(), jobName, startedAt]
  );
};

const upsertEnd = async (jobName, { status, finishedAt, durationMs, error, expectedIntervalMs }) => {
  await query(
    `INSERT INTO cron_runs (id, job_name, last_status, last_run_at, last_duration_ms,
                            last_error, last_success_at, expected_interval_ms, run_count, fail_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)
     ON CONFLICT (job_name) DO UPDATE SET
       last_status          = EXCLUDED.last_status,
       last_run_at          = EXCLUDED.last_run_at,
       last_duration_ms     = EXCLUDED.last_duration_ms,
       last_error           = EXCLUDED.last_error,
       last_success_at      = COALESCE(EXCLUDED.last_success_at, cron_runs.last_success_at),
       expected_interval_ms = COALESCE(EXCLUDED.expected_interval_ms, cron_runs.expected_interval_ms),
       run_count            = cron_runs.run_count + 1,
       fail_count           = cron_runs.fail_count + (CASE WHEN EXCLUDED.last_status = 'error' THEN 1 ELSE 0 END),
       updated_at           = now()`,
    [
      newId(), jobName, status, finishedAt, durationMs,
      error || null,
      status === 'ok' ? finishedAt : null,
      expectedIntervalMs != null ? expectedIntervalMs : null,
      status === 'error' ? 1 : 0,
    ]
  );
};

const findAllRuns = async () => {
  const { rows } = await query(
    `SELECT job_name, last_status, last_started_at, last_run_at, last_success_at,
            last_duration_ms, last_error, run_count, fail_count, expected_interval_ms
     FROM cron_runs ORDER BY job_name ASC`
  );
  return rows.map((r) => ({
    jobName: r.job_name,
    lastStatus: r.last_status,
    lastStartedAt: r.last_started_at,
    lastRunAt: r.last_run_at,
    lastSuccessAt: r.last_success_at,
    lastDurationMs: r.last_duration_ms,
    lastError: r.last_error,
    runCount: r.run_count,
    failCount: r.fail_count,
    expectedIntervalMs: r.expected_interval_ms == null ? null : Number(r.expected_interval_ms),
  }));
};

module.exports = { upsertStart, upsertEnd, findAllRuns };
