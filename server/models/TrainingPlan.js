const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// TrainingPlan (Modernization Horizon 2 — A4 TNA → annual plan)
// ──────────────────────────────────────────────────────────
// The costed annual plan for one fiscal year: a list of plan items, each a
// target (program|skill) for a quarter with the aggregated demand, an estimated
// cost (minor units, feeds A1 budget), and the cohort(s) it was scheduled into.
// One plan per fiscalYear (unique). Soft-delete keeps history; mutations audited.
// ──────────────────────────────────────────────────────────

const planItemSchema = new mongoose.Schema(
  {
    target: {
      kind: { type: String, enum: ['program', 'skill'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    quarter: { type: String, trim: true, match: [/^\d{4}-Q[1-4]$/, 'quarter must be YYYY-Qn'], default: '' },
    demand: { type: Number, min: 0, default: 0 },          // aggregated headcount
    estCostMinor: { type: Number, min: 0, default: 0 },    // integer minor units
    cohortIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  },
  { _id: true },
);

const trainingPlanSchema = new mongoose.Schema(
  {
    fiscalYear: { type: String, match: [/^\d{4}$/, 'fiscalYear must be a 4-digit year'], required: true, unique: true },
    items: { type: [planItemSchema], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  trainingPlanSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

module.exports = mongoose.model('TrainingPlan', trainingPlanSchema);
