const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// RequiredTraining (Modernization Horizon 1 — A3 compliance matrix)
// ──────────────────────────────────────────────────────────
// "This role / department / office (or everyone) must complete this program
// within N days, repeating on a cadence." The legal/audit backbone: compliance
// is DERIVED per user (matching requirements vs their Certificate state within
// the due window) — this model only stores the rule, never per-user status.
//
// Soft-delete so archiving a rule keeps history; mutations publish
// `requirement.changed` so A8 (auto-assign) can re-evaluate.
// ──────────────────────────────────────────────────────────

const requiredTrainingSchema = new mongoose.Schema(
  {
    // Who the rule applies to. `value` is the role name, departmentId, or
    // officeId (as a string); ignored/'' when type === 'all'.
    appliesTo: {
      type: {
        type: String,
        enum: ['role', 'department', 'office', 'all'],
        required: true,
      },
      value: { type: String, default: '' },
    },

    // What must be completed. kind 'program' → a LearningProgram; 'path' → a
    // LearningPath (completion = every program step certified).
    target: {
      kind: { type: String, enum: ['program', 'path'], default: 'program' },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },

    // Days to complete, from when the rule first applies to the user
    // (max of the user's join + the rule's creation — there is no hire-date
    // field today). Recurrence re-opens the rule after each cadence.
    dueWithinDays: { type: Number, min: [1, 'dueWithinDays must be ≥ 1'], default: 90 },
    recurrence: { type: String, enum: ['once', 'annual', 'biennial'], default: 'once' },
    mandatory: { type: Boolean, default: true },

    // Optional label for the matrix (else derived from the target's name).
    label: { type: String, trim: true, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted rules unless asked explicitly (mirrors Room).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  requiredTrainingSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

requiredTrainingSchema.index({ 'appliesTo.type': 1, 'appliesTo.value': 1, isDeleted: 1 });

module.exports = mongoose.model('RequiredTraining', requiredTrainingSchema);
