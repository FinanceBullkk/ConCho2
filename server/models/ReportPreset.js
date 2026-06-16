const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// ReportPreset (Modernization Horizon 1 — A5 part 2)
// ──────────────────────────────────────────────────────────
// A saved report configuration: a named set of filters for one of the
// audit-ready reports (training hours / compliance / evidence pack). Lets HR
// re-run the same scoped report without re-entering filters. The `schedule`
// field is persisted for a future cron that auto-runs monthly/quarterly presets
// and notifies the owner (deferred — no confirmed HR cadence need yet).
//
// Soft-delete keeps history; mutations are audited (entity:'ReportPreset').
// ──────────────────────────────────────────────────────────

const reportPresetSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Preset name is required'], trim: true },
    kind: { type: String, enum: ['hours', 'compliance', 'evidence'], default: 'evidence' },

    // Saved filters. Dates are YYYY-MM-DD strings (the report query format).
    filters: {
      from: { type: String, default: '' },
      to: { type: String, default: '' },
      departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
      role: { type: String, default: '' },
      programIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram' }],
    },

    // Auto-run cadence (consumed by a future cron). 'none' = manual only.
    schedule: { type: String, enum: ['none', 'monthly', 'quarterly'], default: 'none' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted presets unless asked explicitly.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  reportPresetSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

reportPresetSchema.index({ schedule: 1, isDeleted: 1 });

module.exports = mongoose.model('ReportPreset', reportPresetSchema);
