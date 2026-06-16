const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// CostEntry (Modernization Horizon 1 — A1 budget & cost management)
// ──────────────────────────────────────────────────────────
// One actual training-cost line item: "we spent X on a trainer/venue/material
// for this program / cohort / session / vendor on this date". Roll-ups sum
// these by any scope dimension; cost-per-completion + budget-vs-actual derive
// from them (never stored). Amounts are integer MINOR currency units (the same
// convention the executive ROI cost-config uses) so all money math stays
// integer-exact. `scope.departmentId` is a deliberate, minimal extension of the
// handoff model (programId/cohortId/sessionId/vendorId) so the department
// roll-up + budget variance can match entries directly. `vendorId` is nullable
// until A2 (Vendor) lands in Horizon 2.
//
// Soft-delete keeps the audit trail; every mutation is audited at the controller.
// ──────────────────────────────────────────────────────────

const COST_TYPES = ['trainer', 'venue', 'material', 'vendor', 'travel', 'other'];

const costEntrySchema = new mongoose.Schema(
  {
    // What this cost is attributed to — all optional; an entry with no scope is
    // an org-wide/unallocated cost (still counts in fiscal-year totals).
    scope: {
      programId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram', default: null },
      cohortId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
      sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule', default: null },
      departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
      vendorId: { type: mongoose.Schema.Types.ObjectId, default: null }, // no Vendor model until A2
    },

    type: { type: String, enum: COST_TYPES, default: 'other' },

    // Integer minor units (e.g. cents / đồng). Never floats — money math stays exact.
    amountMinor: { type: Number, min: [0, 'amountMinor must be ≥ 0'], required: true },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, required: true },

    incurredOn: { type: Date, required: true },
    poRef: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted entries unless asked explicitly (mirrors Room/RequiredTraining).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct', 'aggregate'];
for (const hook of SOFT_DELETE_HOOKS) {
  if (hook === 'aggregate') {
    costEntrySchema.pre('aggregate', function () {
      // Prepend an isDeleted filter unless the pipeline already constrains it.
      const pipeline = this.pipeline();
      const constrains = pipeline.some((s) => s.$match && 'isDeleted' in s.$match);
      if (!constrains) pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
    });
    continue;
  }
  costEntrySchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

costEntrySchema.index({ 'scope.programId': 1, isDeleted: 1 });
costEntrySchema.index({ 'scope.departmentId': 1, isDeleted: 1 });
costEntrySchema.index({ incurredOn: 1, isDeleted: 1 });

module.exports = mongoose.model('CostEntry', costEntrySchema);
module.exports.COST_TYPES = COST_TYPES;
