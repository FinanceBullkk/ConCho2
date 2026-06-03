const mongoose = require('mongoose');
const { ITEM_TYPES } = require('./Assessment');

// Reusable authored question. Assessments import these as immutable item
// snapshots, so later bank edits do not rewrite historical attempts/quizzes.
const assessmentQuestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: { values: ITEM_TYPES, message: '{VALUE} is not a valid item type' },
      required: true,
    },
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], default: undefined },
    correctOptionIndexes: { type: [Number], default: undefined },
    acceptedAnswers: { type: [String], default: undefined },
    points: { type: Number, default: 1, min: [0, 'Points cannot be negative'] },
    explanation: { type: String, trim: true, default: '' },
    tags: { type: [String], default: [] },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningProgram',
      default: null,
      index: true,
    },
    cohortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

assessmentQuestionSchema.index({ type: 1, isDeleted: 1 });
assessmentQuestionSchema.index({ tags: 1 });

module.exports = mongoose.model('AssessmentQuestion', assessmentQuestionSchema);
