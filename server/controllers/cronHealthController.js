// Phase-5 D-CronRun: heartbeats are read from the dual-backend seam — the
// writes (lib/cronMonitor) land on the DB_BACKEND-selected backend only.
const cronRunRepo = require('../lib/cron-run-repository');
const { CRON_JOBS, deriveHealth } = require('../lib/cronMonitor');
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
    const runs = await cronRunRepo.findAllRuns();
    const now = Date.now();
    const runsByName = new Map(runs.map((run) => [run.jobName, run]));
    const configuredJobs = Object.values(CRON_JOBS);
    const configuredNames = new Set(configuredJobs.map((job) => job.jobName));

    const toJob = (configOrRun) => {
      const configured = configOrRun.jobName && configuredNames.has(configOrRun.jobName)
        ? configOrRun
        : null;
      const stored = configured ? runsByName.get(configured.jobName) : configOrRun;
      const run = {
        jobName: configured?.jobName || stored.jobName,
        lastStatus: stored?.lastStatus || null,
        lastStartedAt: stored?.lastStartedAt || null,
        lastRunAt: stored?.lastRunAt || null,
        lastSuccessAt: stored?.lastSuccessAt || null,
        lastDurationMs: stored?.lastDurationMs || 0,
        lastError: stored?.lastError || null,
        runCount: stored?.runCount || 0,
        failCount: stored?.failCount || 0,
        expectedIntervalMs: stored?.expectedIntervalMs ?? configured?.expectedIntervalMs ?? null,
      };

      return {
        ...run,
        ...deriveHealth(run, now),
      };
    };

    const jobs = [
      ...configuredJobs.map(toJob),
      ...runs.filter((run) => !configuredNames.has(run.jobName)).map(toJob),
    ].sort((a, b) => a.jobName.localeCompare(b.jobName));

    // Overall verdict: degraded if any monitored job is not 'ok'.
    const overall = jobs.length > 0 && jobs.every((j) => j.healthy) ? 'ok' : 'degraded';

    res.json({ success: true, data: { overall, jobs }, count: jobs.length });
  } catch (err) {
    handleError(res, err);
  }
};

module.exports = { getCronHealth };
