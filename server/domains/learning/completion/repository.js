const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');
const Schedule = require('../../../models/Schedule');
const Attendance = require('../../../models/Attendance');
const Evaluation = require('../../../models/Evaluation');
const Certificate = require('../../../models/Certificate');
const Feedback = require('../../../models/Feedback');
const AssessmentAttempt = require('../../../models/AssessmentAttempt');

// Statuses that count as "attended" — mirrors the dashboard convention
// (Attendance index { userId, status } is used for status:{$in:['P','L']}).
const ATTENDED_STATUSES = ['P', 'L'];

// Default completion policy when a cohort has no linked program / policy.
const DEFAULT_POLICY = Object.freeze({
  attendanceThresholdPercent: 0,
  requiresAssessment: false,
  requiresFeedback: false,
});

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId isDeleted').lean();

// Resolve the completion policy governing a cohort (from its program, or the
// lenient default). Also returns the program name for certificate snapshots.
const resolveCompletionContext = async (cohort) => {
  if (!cohort?.programId) {
    return { policy: { ...DEFAULT_POLICY }, programId: null, programName: cohort?.courseName || '' };
  }
  const program = await LearningProgram.findById(cohort.programId)
    .select('name completionPolicy')
    .lean();
  return {
    policy: { ...DEFAULT_POLICY, ...(program?.completionPolicy || {}) },
    programId: cohort.programId,
    programName: program?.name || cohort.courseName || '',
  };
};

const countCohortSessions = (cohortId) => Schedule.countDocuments({ classId: cohortId });

const countAttendedSessions = async (cohortId, userId) => {
  const scheduleIds = await Schedule.find({ classId: cohortId }).distinct('_id');
  if (scheduleIds.length === 0) return 0;
  return Attendance.countDocuments({
    scheduleId: { $in: scheduleIds },
    userId,
    status: { $in: ATTENDED_STATUSES },
  });
};

const findEvaluation = (cohortId, userId) =>
  Evaluation.findOne({ classId: cohortId, userId }).lean({ virtuals: true });

const findFeedback = (cohortId, userId) =>
  Feedback.findOne({ cohortId, userId, isDeleted: false }).lean();

// Best passing assessment attempt for a learner in a cohort (generic engine).
// Complements the legacy Evaluation path — either satisfies requiresAssessment.
const findPassingAttempt = (cohortId, userId) =>
  AssessmentAttempt.findOne({ cohortId, userId, passed: true, isDeleted: false })
    .sort({ scorePercent: -1 })
    .lean();

const findLearnerName = async (userId) => {
  const User = require('../../../models/User');
  const user = await User.findById(userId).select('name empCode').lean();
  return user;
};

// ── Certificate persistence ───────────────────────────────
const findActiveCertificate = (userId, cohortId) =>
  Certificate.findOne({ userId, cohortId, status: 'Issued', isDeleted: false }).lean();

const createCertificate = async (data) => {
  const doc = await Certificate.create(data);
  return doc.toObject();
};

const findCertificateById = (id) =>
  Certificate.findOne({ _id: id, isDeleted: false }).lean();

const listCertificates = ({ cohortId, learnerId }) => {
  const filter = { isDeleted: false };
  if (cohortId) filter.cohortId = cohortId;
  if (learnerId) filter.userId = learnerId;
  return Certificate.find(filter)
    .populate('userId', 'empCode name department')
    .sort({ issuedAt: -1 })
    .lean();
};

const markRevoked = (id, reason) =>
  Certificate.findByIdAndUpdate(
    id,
    { status: 'Revoked', revokedAt: new Date(), revokedReason: reason || '' },
    { new: true },
  ).lean();

const findByVerificationCode = (code) =>
  Certificate.findOne({ verificationCode: code, isDeleted: false }).lean();

module.exports = {
  ATTENDED_STATUSES,
  DEFAULT_POLICY,
  findCohort,
  resolveCompletionContext,
  countCohortSessions,
  countAttendedSessions,
  findEvaluation,
  findFeedback,
  findPassingAttempt,
  findLearnerName,
  findActiveCertificate,
  createCertificate,
  findCertificateById,
  listCertificates,
  markRevoked,
  findByVerificationCode,
};
