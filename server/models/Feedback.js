const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Feedback Model (Wave B — completion & survey foundation)
// ──────────────────────────────────────────────────────────
// A learner's end-of-cohort feedback/survey. One per learner per cohort
// (re-submitting updates the existing record via upsert in the use-case).
//
// Purpose: a `completionPolicy.requiresFeedback` rule was previously
// unverifiable (no feedback subsystem), so completion reported it permanently
// unmet. This is the minimal honest foundation that lets the completion engine
// check whether a learner has actually submitted feedback.
//
// Soft-delete fields are carried for trash-flow consistency; there is no
// delete endpoint yet, and reads filter `isDeleted: false`.
// ──────────────────────────────────────────────────────────

const ratingField = (label) => ({
  type: Number,
  min: [1, `${label} cannot be below 1`],
  max: [5, `${label} cannot exceed 5`],
  default: null,
});

const feedbackSchema = new mongoose.Schema(
  {
    cohortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Cohort reference is required'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    // Denormalised at submit for program-level feedback reporting later.
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningProgram',
      default: null,
    },

    // Overall satisfaction (required). Optional dimension ratings keep this a
    // real survey without over-modelling a generic question engine (YAGNI).
    rating: {
      type: Number,
      required: [true, 'An overall rating is required'],
      min: [1, 'Rating cannot be below 1'],
      max: [5, 'Rating cannot exceed 5'],
    },
    contentRating: ratingField('Content rating'),
    instructorRating: ratingField('Instructor rating'),
    comment: {
      type: String,
      trim: true,
      maxlength: [2000, 'Comment cannot exceed 2000 characters'],
      default: '',
    },

    // Who pressed submit (usually == userId; an Admin may submit on behalf).
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Soft delete (trash) — reserved for future delete flow.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One feedback per learner per cohort. The submit use-case upserts on this key,
// so a re-submission updates the existing record rather than duplicating.
feedbackSchema.index({ cohortId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
