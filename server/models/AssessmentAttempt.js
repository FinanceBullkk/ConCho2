const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// AssessmentAttempt Model (Wave B — generic assessment engine v1)
// ──────────────────────────────────────────────────────────
// A learner's auto-graded attempt at an Assessment. v1 is one-shot: the learner
// submits answers and the attempt is graded immediately (score frozen).
//
// `cohortId` is denormalised from the assessment so the completion engine can
// resolve "did this learner pass an assessment for this cohort?" with a single
// indexed query, without joining back through Assessment.
// ──────────────────────────────────────────────────────────

const answerSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedOptionIndexes: { type: [Number], default: undefined },
    text: { type: String, default: undefined },
    // Per-item grading outcome (snapshotted at submit).
    pointsEarned: { type: Number, default: 0 },
    pointsPossible: { type: Number, default: 0 },
    correct: { type: Boolean, default: false },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessment',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cohortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
      index: true,
    },

    answers: { type: [answerSchema], default: [] },

    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    scorePercent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },

    submittedAt: { type: Date, default: () => new Date() },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Completion lookup: "does this learner have a passing attempt for this cohort?"
attemptSchema.index({ cohortId: 1, userId: 1, passed: 1 });

module.exports = mongoose.model('AssessmentAttempt', attemptSchema);
