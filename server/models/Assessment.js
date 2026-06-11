const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Assessment Model (Wave B — generic assessment engine v1)
// ──────────────────────────────────────────────────────────
// A configurable quiz attached to a cohort. Generalises the legacy English
// 4-skill `Evaluation` into a generic, item-based, auto-gradable assessment.
// The legacy Evaluation path is untouched — this is the forward path.
//
// v1 item types are objective & auto-gradable. Choice items reference their
// correct answer by OPTION INDEX (not a generated _id), so an author can author
// the whole assessment in one request without a create→read→patch round-trip.
//
// Soft-delete (trash) via isDeleted; archiving an assessment never hard-deletes.
// ──────────────────────────────────────────────────────────

const ITEM_TYPES = ['single_choice', 'multiple_choice', 'short_text'];

const itemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: { values: ITEM_TYPES, message: '{VALUE} is not a valid item type' },
      required: true,
    },
    prompt: { type: String, required: true, trim: true },

    // Choice types: option labels + the indexes that are correct.
    options: { type: [String], default: undefined },
    correctOptionIndexes: { type: [Number], default: undefined },

    // short_text: accepted answers (compared case-insensitively, trimmed).
    acceptedAnswers: { type: [String], default: undefined },

    // Optional source link when an item was imported from the question bank.
    questionBankItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentQuestion',
      default: null,
    },

    points: { type: Number, default: 1, min: [0, 'Points cannot be negative'] },
  },
  { _id: true }
);

const assessmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'A title is required'], trim: true },
    description: { type: String, trim: true, default: '' },

    cohortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Cohort reference is required'],
      index: true,
    },
    // Denormalised from the cohort at create for program-level reporting later.
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningProgram',
      default: null,
    },

    items: {
      type: [itemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'An assessment needs at least one item',
      },
    },

    // % of total points required to pass an attempt (0 = any submission passes).
    passingScorePercent: { type: Number, default: 0, min: 0, max: 100 },
    // 0 = unlimited attempts.
    maxAttempts: { type: Number, default: 0, min: 0 },
    // Only published assessments can be attempted by learners.
    isPublished: { type: Boolean, default: false },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assessmentSchema.index({ cohortId: 1, isDeleted: 1 });

module.exports = mongoose.model('Assessment', assessmentSchema);
module.exports.ITEM_TYPES = ITEM_TYPES;
