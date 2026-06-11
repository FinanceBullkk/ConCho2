const Assessment = require('../../models/Assessment');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const AssessmentQuestion = require('../../models/AssessmentQuestion');
const Class = require('../../models/Class');

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
};
