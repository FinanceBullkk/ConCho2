const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');
const Schedule = require('../../../models/Schedule');
const Enrollment = require('../../../models/Enrollment');
const Certificate = require('../../../models/Certificate');
const User = require('../../../models/User');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId isDeleted').lean();

const listActiveCohorts = () =>
  Class.find({ isDeleted: { $ne: true } })
    .select('_id classCode courseName programId isDeleted')
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

module.exports = {
  findCohort,
  listActiveCohorts,
  findProgramName,
  listCohortLearnerIds,
  findUsers,
  listCohortCertificates,
};
