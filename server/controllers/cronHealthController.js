const CronRun = require('../models/CronRun');
const { deriveHealth } = require('../lib/cronMonitor');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Cron Health Controller (Admin-only)
//
// Surfaces the CronRun heartbeats so an admin can confirm that the
// scheduled jobs (nightly reconcile, attendance reminders) actually run —
// the core "did cron fire on the free tier?" production-readiness check.
// Read-only; no mutations, so no audit entry.
// ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/cron/health
 * Returns every monitored job's heartbeat + a derived health verdict.
 */
const getCronHealth = async (req, res) => {
  try {
    const runs = await CronRun.find().sort({ jobName: 1 }).lean();
    const now = Date.now();

    const jobs = runs.map((run) => ({
      jobName: run.jobName,
      lastStatus: run.lastStatus,
      lastStartedAt: run.lastStartedAt,
      lastRunAt: run.lastRunAt,
      lastSuccessAt: run.lastSuccessAt,
      lastDurationMs: run.lastDurationMs,
      lastError: run.lastError,
      runCount: run.runCount,
      failCount: run.failCount,
      expectedIntervalMs: run.expectedIntervalMs,
      ...deriveHealth(run, now),
    }));

    // Overall verdict: degraded if any monitored job is not 'ok'.
    const overall = jobs.length > 0 && jobs.every((j) => j.healthy) ? 'ok' : 'degraded';

    res.json({ success: true, data: { overall, jobs }, count: jobs.length });
  } catch (err) {
    handleError(res, err);
  }
};

module.exports = { getCronHealth };
