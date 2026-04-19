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

// ── Compound unique index: one evaluation per user per class ─
evaluationSchema.index({ classId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Evaluation', evaluationSchema);
