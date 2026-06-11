const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Evaluation Model
// ──────────────────────────────────────────────────────────
// One evaluation per user per class.
// Scores: grammar, vocabulary, pronunciation, fluency (0-10).
// Virtual averageScore computed from all four.
// ──────────────────────────────────────────────────────────

const evaluationSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class reference is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    level: {
      type: String,
      trim: true,
      default: '',
    },
    grammarScore: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [10, 'Score cannot exceed 10'],
      default: 0,
    },
    vocabularyScore: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [10, 'Score cannot exceed 10'],
      default: 0,
    },
    pronunciationScore: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [10, 'Score cannot exceed 10'],
      default: 0,
    },
    fluencyScore: {
      type: Number,
      min: [0, 'Score cannot be negative'],
      max: [10, 'Score cannot exceed 10'],
      default: 0,
    },
    teacherComment: {
      type: String,
      trim: true,
      default: '',
    },

    // Accountability — the User._id (Teacher/Admin) who created or last
    // updated this evaluation. Used for audit, dispute resolution, and as
    // the foundation for future teacher-of-record scoping. Optional only
    // for backward compatibility with pre-existing rows.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // ── Soft-delete fields (DATA-014, audit round 2) ────────
    // Golden rule: evaluation data is NEVER hard-deleted — assessment
    // evidence must stay recoverable. Admin "delete" flips these instead.
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: average of all 4 scores ──────────────────────
evaluationSchema.virtual('averageScore').get(function () {
  const sum =
    this.grammarScore +
    this.vocabularyScore +
    this.pronunciationScore +
    this.fluencyScore;
  return Math.round((sum / 4) * 100) / 100; // 2 decimal places
});

// ── Soft-delete auto-filter (DATA-014) ─────────────────────
// Same pattern as User/Team/Class: reads exclude trashed rows unless the
// caller explicitly constrains isDeleted ("show me the trash" stays possible).
// 'distinct' included from day one (DATA-012 — distinct bypassed the hooks
// on the older models until audit round 2).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'findOneAndDelete', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  evaluationSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
}

// The Excel export reads evaluations via Evaluation.aggregate
// (services/export/evaluation-export.js) — aggregation skips query
// middleware, so inject the $match like User/Team/Class do.
evaluationSchema.pre('aggregate', function () {
  const pipeline = this.pipeline();
  const hasExplicitFilter = pipeline.some(
    (stage) => stage && stage.$match && stage.$match.isDeleted !== undefined,
  );
  if (!hasExplicitFilter) {
    pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
  }
});

// ── Compound unique index: one evaluation per user per class ─
// Kept FULL-unique (not partial/live-only): a re-evaluation after a soft
// delete REVIVES the trashed row in place (controllers/evaluationController
// upsert path) — "one evaluation per user per class" is a logical slot, and
// reviving preserves the index without a production index migration.
evaluationSchema.index({ classId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Evaluation', evaluationSchema);
