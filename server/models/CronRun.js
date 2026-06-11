const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// CronRun — heartbeat for scheduled/cron-triggered jobs.
//
// One document per job (keyed by unique `jobName`), upserted on every
// run by lib/cronMonitor.js. Survives process restarts so an admin can
// answer "did the nightly reconcile actually run, and when?" — the core
// production-readiness gap on Render free-tier (cron only fires when the
// dyno is awake, so silent misses are easy).
//
// NOT soft-deleted / NOT TTL'd: this is a small, fixed-size ops table
// (one row per job name) whose whole point is durable last-run state.
// ──────────────────────────────────────────────────────────

const cronRunSchema = new mongoose.Schema(
  {
    // Stable job identifier, e.g. 'reconcile', 'attendance-reminders'.
    jobName: { type: String, required: true, unique: true, index: true },

    // Lifecycle of the most recent run.
    lastStatus: {
      type: String,
      enum: ['running', 'ok', 'error'],
      default: 'running',
    },
    lastStartedAt: { type: Date, default: null }, // when the latest run began
    lastRunAt: { type: Date, default: null },     // when the latest run finished (ok or error)
    lastSuccessAt: { type: Date, default: null }, // when it last finished 'ok'
    lastDurationMs: { type: Number, default: 0 },
    lastError: { type: String, default: null },   // message only (no stack — avoids leaking detail)

    // Lifetime counters (cheap signal for flakiness).
    runCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },

    // Expected cadence in ms (e.g. 24h for nightly reconcile). Used by the
    // health endpoint to flag a job as 'stale' when it has not succeeded
    // within ~2× this window. Null = cadence unknown (no staleness check).
    expectedIntervalMs: { type: Number, default: null },
  },
  {
    timestamps: true, // createdAt / updatedAt
    versionKey: false,
  }
);

module.exports = mongoose.model('CronRun', cronRunSchema);
