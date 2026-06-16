const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Budget (Modernization Horizon 1 — A1 budget & cost management)
// ──────────────────────────────────────────────────────────
// A planned spend allowance for a fiscal year, optionally scoped to a
// department and/or program. Budget-vs-actual variance derives actual spend by
// summing CostEntry rows that match the budget's scope within the fiscal year —
// the budget row itself only stores the allowance. A budget with neither
// department nor program is the org-wide allowance for that year.
//
// Amounts are integer MINOR currency units (same convention as CostEntry +
// the executive ROI cost-config). Soft-delete keeps history; mutations audited.
// ──────────────────────────────────────────────────────────

const budgetSchema = new mongoose.Schema(
  {
    fiscalYear: { type: String, trim: true, required: true }, // e.g. '2026'

    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram', default: null },

    amountMinor: { type: Number, min: [0, 'amountMinor must be ≥ 0'], required: true },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, required: true },

    label: { type: String, trim: true, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted budgets unless asked explicitly.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  budgetSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

budgetSchema.index({ fiscalYear: 1, departmentId: 1, isDeleted: 1 });

module.exports = mongoose.model('Budget', budgetSchema);
