const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// SessionType (Investment Build Plan #5 — Studio ▸ Scheduling)
// ──────────────────────────────────────────────────────────
// A taxonomy of session kinds (e.g. "Workshop", "Coaching", "Exam") with
// display + default hints. METADATA ONLY: a session may reference a type to
// prefill duration/capacity, but the type NEVER participates in slot/room/
// conflict logic — the ALLOWED_TIME_SLOTS window + the {roomId,startTime} lock
// remain the booking source of truth.
//
// Soft-delete (isDeleted + order) so archiving a type keeps it on the
// historical sessions that referenced it, and order drives display sequence.
// ──────────────────────────────────────────────────────────

const sessionTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },

    // Display colour (hex). The UI uses it for swatches/legends.
    color: { type: String, default: '#6366f1', trim: true },

    // Prefill hints for the booking form. Never enforced here.
    defaultDurationMin: { type: Number, min: [1, 'Duration must be at least 1 minute'], default: 60 },
    defaultCapacity: { type: Number, min: [1, 'Capacity must be at least 1'], default: null },

    // Manual display order (lower = first). New types append to the end.
    order: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted types unless the caller asks explicitly (mirrors Room).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  sessionTypeSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

// List path: live types in display order.
sessionTypeSchema.index({ isDeleted: 1, order: 1 });

module.exports = mongoose.model('SessionType', sessionTypeSchema);
