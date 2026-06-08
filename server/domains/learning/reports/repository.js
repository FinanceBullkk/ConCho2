const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');
const Schedule = require('../../../models/Schedule');
const Enrollment = require('../../../models/Enrollment');
const Attendance = require('../../../models/Attendance');
const Evaluation = require('../../../models/Evaluation');
const Certificate = require('../../../models/Certificate');
const Feedback = require('../../../models/Feedback');
const AssessmentAttempt = require('../../../models/AssessmentAttempt');
const User = require('../../../models/User');
const Assignment = require('../../../models/Assignment');
const LearningPath = require('../../../models/LearningPath');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');
const { ATTENDED_STATUSES } = require('../completion/repository');
const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId teacherIds isDeleted').lean();

const listActiveCohorts = (scope = {}) =>
  Class.find({ isDeleted: { $ne: true }, ...scope })
    .select('_id classCode courseName programId teacherIds isDeleted')
    .lean();
const listProgramsByIds = (programIds) => programIds.length
  ? LearningProgram.find({ _id: { $in: programIds } })
    .select('_id name completionPolicy certificateValidityDays')
    .lean()
  : [];

const findProgramName = async (programId) => {
  if (!programId) return '';
  const program = await LearningProgram.findById(programId).select('name').lean();
  return program?.name || '';
};

// The cohort's learner set = roster members (session enrolledUsers) ∪ non-dropped
// enrollments (team-based and cohort-based). Returns distinct id strings.
const listCohortLearnerIds = async (cohortId) => {
  const [rosterIds, enrollmentIds] = await Promise.all([
    Schedule.distinct('enrolledUsers', { classId: cohortId }),
    Enrollment.distinct('userId', { classId: cohortId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } }),
  ]);
  const set = new Set([...rosterIds, ...enrollmentIds].map((id) => id.toString()));
  return [...set];
};

const findUsers = (ids) =>
  User.find({ _id: { $in: ids } })
    .select('empCode name department')
    .lean();

// Active (Issued, non-deleted) certificates for the cohort, for status columns.
const listCohortCertificates = (cohortId) =>
  Certificate.find({ cohortId, isDeleted: false })
    .select('userId certificateNumber status issuedAt validFrom validUntil validityDays')
    .lean();

const listCohortSchedules = (cohortIds) => cohortIds.length
  ? Schedule.find({ classId: { $in: cohortIds } })
    .select('_id classId enrolledUsers')
    .lean()
  : [];

const listCohortEnrollments = (cohortIds) => cohortIds.length
  ? Enrollment.find({
    classId: { $in: cohortIds },
    status: { $in: ACTIVE_ENROLLMENT_STATUSES },
  })
    .select('classId userId')
    .lean()
  : [];

const listAttendedAttendance = ({ scheduleIds, userIds }) => {
  if (!scheduleIds.length || !userIds.length) return [];
  return Attendance.find({
    scheduleId: { $in: scheduleIds },
    userId: { $in: userIds },
    status: { $in: ATTENDED_STATUSES },
  })
    .select('scheduleId userId')
    .lean();
};

const listEvaluations = ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  return Evaluation.find({
    classId: { $in: cohortIds },
    userId: { $in: userIds },
  })
    .select('classId userId')
    .lean();
};

const listFeedbackSubmissions = ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  return Feedback.find({
    cohortId: { $in: cohortIds },
    userId: { $in: userIds },
    isDeleted: false,
  })
    .select('cohortId userId')
    .lean();
};

const listPassingAttempts = ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  return AssessmentAttempt.find({
    cohortId: { $in: cohortIds },
    userId: { $in: userIds },
    passed: true,
    isDeleted: false,
  })
    .select('cohortId userId')
    .lean();
};

const listIssuedCertificates = ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  return Certificate.find({
    cohortId: { $in: cohortIds },
    userId: { $in: userIds },
    status: 'Issued',
    isDeleted: false,
  })
    .select('cohortId userId')
    .lean();
};

const dateBoundary = (value, endOfDay = false) => {
  const d = new Date(value);
  d.setUTCHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return d;
};

const listComplianceAssignments = async (query = {}) => {
  const filter = { status: 'active', isDeleted: false };
  if (query.assignmentId) filter._id = query.assignmentId;
  if (query.dueFrom || query.dueTo) {
    filter.dueDate = {};
    if (query.dueFrom) filter.dueDate.$gte = dateBoundary(query.dueFrom);
    if (query.dueTo) filter.dueDate.$lte = dateBoundary(query.dueTo, true);
  }
  if (query.programId) {
    const pathIds = await LearningPath.find({
      programs: query.programId,
      status: { $ne: 'archived' },
      isDeleted: false,
    }).distinct('_id');
    filter.$or = [{ programId: query.programId }];
    if (pathIds.length) filter.$or.push({ pathId: { $in: pathIds } });
  }

  return Assignment.find(filter)
    .populate('programId', 'code name category status')
    .populate({
      path: 'pathId',
      select: 'code title status programs',
      populate: { path: 'programs', select: 'code name category status' },
    })
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();
};

const findOrgUsers = (ids) =>
  User.find({ _id: { $in: ids } })
    .select('empCode name email department departmentId managerId')
    .populate('departmentId', 'code name')
    .populate('managerId', 'empCode name email')
    .lean();

const listProgramCertificates = (userIds, programIds) => {
  if (!userIds.length || !programIds.length) return [];
  return Certificate.find({
    userId: { $in: userIds },
    programId: { $in: programIds },
    isDeleted: false,
  })
    .select('userId programId certificateNumber status issuedAt validFrom validUntil validityDays')
    .sort({ issuedAt: -1 })
    .lean();
};

module.exports = {
  findCohort,
  listActiveCohorts,
  listProgramsByIds,
  findProgramName,
  listCohortLearnerIds,
  findUsers,
  listCohortCertificates,
  listCohortSchedules,
  listCohortEnrollments,
  listAttendedAttendance,
  listEvaluations,
  listFeedbackSubmissions,
  listPassingAttempts,
  listIssuedCertificates,
  listComplianceAssignments,
  findOrgUsers,
  listProgramCertificates,
};
