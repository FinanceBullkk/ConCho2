const CronRun = require('../models/CronRun');

// cron-run-repository — MONGO impl. The CronRun touches of lib/cronMonitor.js
// (recordStart/recordEnd) and cronHealthController, extracted verbatim so the
// Postgres twin swaps cleanly. Impls THROW on failure — the fail-soft
// try/catch stays in cronMonitor so the parity test can assert real errors.

/** recordStart twin — mark the job running now. Upsert by jobName. */
const upsertStart = async (jobName, startedAt) => {
  await CronRun.updateOne(
    { jobName },
    { $set: { lastStatus: 'running', lastStartedAt: startedAt }, $setOnInsert: { jobName } },
    { upsert: true }
  );
};

/**
 * recordEnd twin — close out the latest run. Upsert by jobName.
 * lastSuccessAt only advances on 'ok'; expectedIntervalMs only when provided
 * (a null/undefined cadence never clears a previously stored one); lastError
 * is direct-assigned so an 'ok' run clears a prior error.
 */
const upsertEnd = async (jobName, { status, finishedAt, durationMs, error, expectedIntervalMs }) => {
  const set = { lastStatus: status, lastRunAt: finishedAt, lastDurationMs: durationMs, lastError: error || null };
  if (status === 'ok') set.lastSuccessAt = finishedAt;
  if (expectedIntervalMs != null) set.expectedIntervalMs = expectedIntervalMs;

  const inc = { runCount: 1 };
  if (status === 'error') inc.failCount = 1;

  await CronRun.updateOne({ jobName }, { $set: set, $inc: inc, $setOnInsert: { jobName } }, { upsert: true });
};

/** Health read — ALL heartbeats sorted by jobName (camelCase lean docs). */
const findAllRuns = async () => CronRun.find().sort({ jobName: 1 }).lean();

module.exports = { upsertStart, upsertEnd, findAllRuns };
