const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// LearningPath (Wave C — sequenced learning paths v1)
// ──────────────────────────────────────────────────────────
// A named, ordered curriculum of LearningPrograms a learner progresses through
// in sequence. v1 scope is deliberately minimal:
//   • the array order of `programs` IS the sequence;
//   • per-learner progress is DERIVED from program completion (reuses the
//     prerequisite engine's `hasCompletedProgram`), not stored;
//   • no enrollment side effects and no transitive auto-prerequisites — a path
//     is a curriculum + progress view, nothing more.
//
// Soft-delete (`isDeleted`/`deletedAt`) backs the recoverable trash flow;
// `status` is the catalog visibility state (mirrors LearningProgram).
// ──────────────────────────────────────────────────────────

const statuses = ['active', 'inactive', 'archived'];

const learningPathSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Path code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9][A-Z0-9_-]*$/, 'Path code may contain only A-Z, 0-9, underscore, and hyphen'],
    },
    title: {
      type: String,
      required: [true, 'Path title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    // Ordered list of programs. Position in the array defines the sequence;
    // the use-case de-duplicates while preserving order before persisting.
    programs: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram' }],
      default: [],
    },
    status: {
      type: String,
      enum: statuses,
      default: 'active',
    },
    // Soft delete (recoverable trash) — reads filter `isDeleted: false`.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

learningPathSchema.index({ status: 1, title: 1 });

learningPathSchema.statics.enums = { statuses };

module.exports = mongoose.model('LearningPath', learningPathSchema);
