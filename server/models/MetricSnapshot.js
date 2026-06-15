const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// MetricSnapshot (Investment Build Plan #1 — real analytics time-series)
// ──────────────────────────────────────────────────────────
// One row per metric, per scope, per UTC day. A nightly cron
// (jobs/snapshotJob.js) aggregates the same numbers the dashboard
// computes point-in-time and writes a durable daily value, so trend
// lines reflect ACTUAL history instead of a series recomputed (or faked)
// at read time. analyticsSeriesService reads these back as series/funnel.
//
// Retention: ~400 days (TTL) — long enough for YoY comparison without
// unbounded growth. Tunable via METRIC_SNAPSHOT_RETENTION_DAYS.
// ──────────────────────────────────────────────────────────

const RETENTION_DAYS = Number(process.env.METRIC_SNAPSHOT_RETENTION_DAYS || 400);

const metricSnapshotSchema = new mongoose.Schema(
  {
    // Midnight UTC of the day this value represents.
    date: { type: Date, required: true },

    // What the value is scoped to. 'global' (whole org), 'program' (one
    // LearningProgram), or 'office'. scopeId is null for global.
    scope: {
      type: String,
      enum: ['global', 'program', 'office'],
      required: true,
      default: 'global',
    },
    scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // The metric key, e.g. 'active_enrollments' | 'enrollments' |
    // 'completions' | 'certs_issued'. Free-form so new metrics don't need a
    // schema change — analyticsSeriesService owns the catalogue.
    key: { type: String, required: true },

    value: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// One value per (scope, scopeId, key, day) — the upsert key for the rollup.
// Also serves series reads: equality on scope+scopeId+key, range on date.
metricSnapshotSchema.index(
  { scope: 1, scopeId: 1, key: 1, date: 1 },
  { unique: true }
);

// TTL — drop rows older than the retention window.
metricSnapshotSchema.index({ date: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

module.exports = mongoose.model('MetricSnapshot', metricSnapshotSchema);
