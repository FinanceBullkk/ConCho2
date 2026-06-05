const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');
const Schedule = require('../../../models/Schedule');
const Enrollment = require('../../../models/Enrollment');
const Certificate = require('../../../models/Certificate');
const User = require('../../../models/User');
const Assignment = require('../../../models/Assignment');
const LearningPath = require('../../../models/LearningPath');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId teacherIds isDeleted').lean();

const listActiveCohorts = (scope = {}) =>
  Class.find({ isDeleted: { $ne: true }, ...scope })
    .select('_id classCode courseName programId teacherIds isDeleted')
    .lean();

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
    .select('userId certificateNumber status')
    .lean();

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
    .select('userId programId certificateNumber status issuedAt validUntil')
    .sort({ issuedAt: -1 })
    .lean();
};

module.exports = {
  findCohort,
  listActiveCohorts,
  findProgramName,
  listCohortLearnerIds,
  findUsers,
  listCohortCertificates,
  listComplianceAssignments,
  findOrgUsers,
  listProgramCertificates,
};
