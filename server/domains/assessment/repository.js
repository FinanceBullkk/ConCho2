const Assessment = require('../../models/Assessment');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const AssessmentQuestion = require('../../models/AssessmentQuestion');
const Class = require('../../models/Class');
const Evaluation = require('../../models/Evaluation');
const LearningProgram = require('../../models/LearningProgram');
const { COHORT_SCHEDULING_MODES } = require('../_shared/scheduling-modes');

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId teacherIds isDeleted').lean();

// ── Assessments ───────────────────────────────────────────
const createAssessment = async (data) => {
  const doc = await Assessment.create(data);
  return doc.toObject();
};

const findAssessmentById = (id) =>
  Assessment.findOne({ _id: id, isDeleted: false }).lean();

const updateAssessment = (id, data) =>
  Assessment.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const listAssessments = ({ cohortId, cohortIds, publishedOnly }) => {
  const filter = { isDeleted: false };
  if (cohortId) filter.cohortId = cohortId;
  if (cohortIds) filter.cohortId = { $in: cohortIds };
  if (publishedOnly) filter.isPublished = true;
  return Assessment.find(filter)
    .populate('cohortId', 'classCode courseName')
    .sort({ createdAt: -1 })
    .lean();
};

const softDeleteAssessment = (id) =>
  Assessment.findByIdAndUpdate(
    id,
    { isDeleted: true, deletedAt: new Date() },
    { new: true },
  ).lean();

// ── Attempts ──────────────────────────────────────────────
const countAttempts = (assessmentId, userId) =>
  AssessmentAttempt.countDocuments({ assessmentId, userId, isDeleted: false });

const createAttempt = async (data) => {
  const doc = await AssessmentAttempt.create(data);
  return doc.toObject();
};

const listAttempts = ({ cohortId, cohortIds, assessmentId, learnerId }) => {
  const filter = { isDeleted: false };
  if (cohortId) filter.cohortId = cohortId;
  if (cohortIds) filter.cohortId = { $in: cohortIds };
  if (assessmentId) filter.assessmentId = assessmentId;
  if (learnerId) filter.userId = learnerId;
  return AssessmentAttempt.find(filter)
    .populate('userId', 'empCode name department')
    .populate('assessmentId', 'title')
    .sort({ submittedAt: -1 })
    .lean();
};

const findAttemptById = (id) =>
  AssessmentAttempt.findOne({ _id: id, isDeleted: false }).lean();

const updateAttemptGrade = (id, data) =>
  AssessmentAttempt.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  )
    .populate('userId', 'empCode name department')
    .populate('assessmentId', 'title')
    .lean();

const findQuestionBankItemsByIds = (ids) =>
  AssessmentQuestion.find({ _id: { $in: ids }, isDeleted: false }).lean();

// ── Unified results (rearchitecture Phase 1 convergence) ───
// Legacy English-class evaluations (instructor-scored rubric) for ONE learner
// across all their cohorts — the second "mode" of the single assessment concept
// (alongside learner-attempted quizzes). Soft-deleted rows are auto-filtered.
const listEvaluationsForLearner = (userId) =>
  Evaluation.find({ userId })
    .populate('classId', 'classCode courseName')
    .sort({ updatedAt: -1 })
    .lean();

// ── Grading queue (convergence Phase 4 — slice C1) ─────────
// The staff "to-grade" workspace lists gradable UNITS across both modes:
//   quiz   → published assessments that have a manually-graded (short_text)
//            item, with their attempt counts (open ManualGradingModal per unit);
//   rubric → team-world (English) classes, with their evaluation counts (open
//            the rubric entry per class).

// Published, live assessments that contain ≥1 short_text item (the only items
// that need manual grading), optionally scoped to a cohort set (teacher scope).
const listShortTextAssessments = (cohortIds) => {
  const filter = { isDeleted: false, isPublished: true, 'items.type': 'short_text' };
  if (cohortIds) filter.cohortId = { $in: cohortIds };
  return Assessment.find(filter)
    .populate('cohortId', 'classCode courseName')
    .sort({ createdAt: -1 })
    .lean();
};

// Attempt counts per assessment (single aggregation; live attempts only).
const countAttemptsByAssessment = (assessmentIds) => {
  if (!assessmentIds.length) return Promise.resolve([]);
  return AssessmentAttempt.aggregate([
    { $match: { assessmentId: { $in: assessmentIds }, isDeleted: false } },
    { $group: { _id: '$assessmentId', count: { $sum: 1 } } },
  ]);
};

// Cohort-world (quiz) class ids — classes whose program schedulingMode is
// self_enroll|nomination. Mirrors domains/schedule/repository.findCohortModeClassIds
// (same SSOT: domains/_shared/scheduling-modes); kept local so the assessment
// domain owns its reads. Used to EXCLUDE quiz-world classes from rubric units —
// rubric (English) grading is team-world only.
const findCohortModeClassIds = async () => {
  const programs = await LearningProgram.find(
    { schedulingMode: { $in: COHORT_SCHEDULING_MODES } },
  ).select('_id').lean();
  if (programs.length === 0) return [];
  const classes = await Class.find(
    { programId: { $in: programs.map((p) => p._id) } },
  ).select('_id').lean();
  return classes.map((c) => c._id);
};

// Live classes the actor may rubric-grade. includeIds = the teacher's visible
// classes (null = all → Admin); excludeIds = cohort-mode (quiz-world) classes.
const listGradableClasses = ({ includeIds = null, excludeIds = [] }) => {
  const idFilter = {};
  if (includeIds) idFilter.$in = includeIds;
  if (excludeIds && excludeIds.length) idFilter.$nin = excludeIds;
  const filter = { isDeleted: { $ne: true } };
  if (Object.keys(idFilter).length) filter._id = idFilter;
  return Class.find(filter).select('classCode courseName status').sort({ classCode: 1 }).lean();
};

// Evaluation counts per class (single aggregation).
const countEvaluationsByClass = (classIds) => {
  if (!classIds.length) return Promise.resolve([]);
  return Evaluation.aggregate([
    { $match: { classId: { $in: classIds } } },
    { $group: { _id: '$classId', count: { $sum: 1 } } },
  ]);
};

module.exports = {
  findCohort,
  createAssessment,
  findAssessmentById,
  updateAssessment,
  listAssessments,
  softDeleteAssessment,
  countAttempts,
  createAttempt,
  listAttempts,
  findAttemptById,
  updateAttemptGrade,
  findQuestionBankItemsByIds,
  listEvaluationsForLearner,
  listShortTextAssessments,
  countAttemptsByAssessment,
  findCohortModeClassIds,
  listGradableClasses,
  countEvaluationsByClass,
};
