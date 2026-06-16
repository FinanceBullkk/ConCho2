const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// TrainingRequest (Modernization Horizon 2 — A4 TNA → annual plan)
// ──────────────────────────────────────────────────────────
// One demand-intake line: "department D needs <headcount> people trained on
// <program|skill> by <quarter>". L&D aggregates these into demand, then a
// planner turns approved requests into costed plan items + scheduled cohorts.
//
// Status machine: submitted → in-review → approved → planned, or → rejected.
// (The A7 approval engine — Horizon 3 — will later DRIVE these transitions; for
// now they are manual, capability-gated actions.) Soft-delete keeps the audit
// trail; every mutation is audited at the controller.
// ──────────────────────────────────────────────────────────

const STATUSES = ['submitted', 'in-review', 'approved', 'planned', 'rejected'];
const PRIORITIES = ['low', 'med', 'high'];
const TARGET_KINDS = ['program', 'skill'];

const trainingRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },

    // What training is needed — a program (LearningProgram) or a skill (Skill).
    target: {
      kind: { type: String, enum: TARGET_KINDS, required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },

    headcount: { type: Number, min: [1, 'headcount must be ≥ 1'], required: true },
    rationale: { type: String, trim: true, maxlength: 1000, default: '' },
    priority: { type: String, enum: PRIORITIES, default: 'med' },

    // VN fiscal quarter tag, e.g. '2026-Q1'. Drives the by=quarter demand roll-up.
    targetQuarter: { type: String, trim: true, match: [/^\d{4}-Q[1-4]$/, 'targetQuarter must be YYYY-Qn'], required: true },

    status: { type: String, enum: STATUSES, default: 'submitted' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

// Auto-exclude soft-deleted requests (mirrors Vendor/TrainerProfile).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct', 'aggregate'];
for (const hook of SOFT_DELETE_HOOKS) {
  if (hook === 'aggregate') {
    trainingRequestSchema.pre('aggregate', function () {
      const pipeline = this.pipeline();
      const constrains = pipeline.some((s) => s.$match && 'isDeleted' in s.$match);
      if (!constrains) pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
    });
    continue;
  }
  trainingRequestSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

trainingRequestSchema.index({ status: 1, targetQuarter: 1, isDeleted: 1 });
trainingRequestSchema.index({ departmentId: 1, isDeleted: 1 });

module.exports = mongoose.model('TrainingRequest', trainingRequestSchema);
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.TARGET_KINDS = TARGET_KINDS;
