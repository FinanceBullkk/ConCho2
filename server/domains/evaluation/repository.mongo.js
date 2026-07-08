const Evaluation = require('../../models/Evaluation');
const Enrollment = require('../../models/Enrollment');

// evaluation/repository — MONGO impl. The Evaluation-model touches of
// evaluationController (B3), extracted verbatim so the Postgres twin swaps
// cleanly. Hydrated docs are returned where the controller res.json's them
// (virtuals — averageScore — serialize via the schema's toJSON config).

// Look up INCLUDING trashed rows (explicit isDeleted skips the soft-delete
// hook): the {classId,userId} unique index is FULL, so a re-evaluation after
// a soft delete must REVIVE the trashed row in place (DATA-014). `null` in
// the $in matches legacy rows that predate the isDeleted field.
const findForClassUserIncludingTrashed = (classId, userId) =>
  Evaluation.findOne({ classId, userId, isDeleted: { $in: [true, false, null] } }).lean();

// Upsert-by-(classId,userId): revive-in-place when `reviving`; createdBy only
// on the initial insert — never overwrite the original author.
const upsertEvaluation = (classId, userId, { fields, reviving, createdBy }) =>
  Evaluation.findOneAndUpdate(
    { classId, userId, isDeleted: { $in: [true, false, null] } },
    {
      $set: { ...fields, ...(reviving ? { isDeleted: false, deletedAt: null } : {}) },
      $setOnInsert: { createdBy },
    },
    { new: true, upsert: true, runValidators: true }
  );

// SOFT delete — the model's findOneAndUpdate hook scopes this to live rows
// (second delete → null). Returns the PRE-update doc (audit's before-diff).
const softDeleteById = (id) =>
  Evaluation.findByIdAndUpdate(id, { $set: { isDeleted: true, deletedAt: new Date() } });

const findAllPopulated = (filter) =>
  Evaluation.find(filter)
    .populate('classId', 'classCode courseName')
    .populate('userId', 'empCode name department');

const findByIdPopulated = (id) =>
  Evaluation.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('userId', 'empCode name department');

// Active enrollments for a class — the learners eligible to be graded.
// populate('userId') is hook-filtered: trashed users yield null (dropped by
// the controller's dedupe loop).
const findActiveEnrollmentsWithUsers = (classId) =>
  Enrollment.find({ classId, status: 'Active' })
    .populate('userId', 'empCode name department')
    .lean();

module.exports = {
  findForClassUserIncludingTrashed,
  upsertEvaluation,
  softDeleteById,
  findAllPopulated,
  findByIdPopulated,
  findActiveEnrollmentsWithUsers,
};
