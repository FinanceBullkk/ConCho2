const Enrollment = require('../../../models/Enrollment');
const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');

// All queries here are scoped to cohort-based enrollments (teamId = null).
// Team-based enrollments stay owned by the legacy enrollment/team controllers.

const findActiveCohortEnrollment = (userId, cohortId) =>
  Enrollment.findOne({ userId, classId: cohortId, teamId: null, status: 'Active' }).lean();

const createCohortEnrollment = async ({ userId, cohortId }) => {
  const doc = await Enrollment.create({
    userId,
    classId: cohortId,
    teamId: null,
    status: 'Active',
  });
  return doc.toObject();
};

const listCohortEnrollments = ({ cohortId, learnerId }) => {
  const filter = { teamId: null };
  if (cohortId) filter.classId = cohortId;
  if (learnerId) filter.userId = learnerId;
  return Enrollment.find(filter)
    .populate('userId', 'empCode name department status')
    .populate('classId', 'classCode courseName programId')
    .sort({ createdAt: -1 })
    .lean();
};

// Unified self read (converge Phase 2): ALL enrollments for one learner across
// BOTH modes — team-based (teamId set) and cohort-based (teamId null). Both
// share the Enrollment model; this is the one place that reads them together.
// Populates cohort + group so the DTO can present one shape regardless of mode.
const listEnrollmentsForLearner = (userId) =>
  Enrollment.find({ userId })
    .populate('classId', 'classCode courseName programId')
    .populate('teamId', 'name')
    .sort({ joinedAt: -1 })
    .lean();

const findCohortEnrollmentById = (id) =>
  Enrollment.findOne({ _id: id, teamId: null }).lean();

const markDropped = (id) =>
  Enrollment.findByIdAndUpdate(
    id,
    { status: 'Dropped', leftAt: new Date() },
    { new: true },
  ).lean();

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId isDeleted').lean();

// Resolve the program scheduling mode that governs a cohort, or null when the
// cohort has no linked program. Used to gate self-enrollment.
const findCohortSchedulingMode = async (cohortId) => {
  const cohort = await Class.findById(cohortId).select('programId').lean();
  if (!cohort?.programId) return null;
  const program = await LearningProgram.findById(cohort.programId).select('schedulingMode').lean();
  return program?.schedulingMode || null;
};

// Count Active cohort-based enrollments in a cohort (Wave E2 capacity).
const countActiveCohortEnrollments = (cohortId) =>
  Enrollment.countDocuments({ classId: cohortId, teamId: null, status: 'Active' });

// Resolve the program capacity policy governing a cohort, or {} when there is no
// linked program (Wave E2). Mirrors findCohortSchedulingMode.
const findCohortCapacityPolicy = async (cohortId) => {
  const cohort = await Class.findById(cohortId).select('programId').lean();
  if (!cohort?.programId) return {};
  const program = await LearningProgram.findById(cohort.programId).select('capacityPolicy').lean();
  return program?.capacityPolicy || {};
};

module.exports = {
  findActiveCohortEnrollment,
  createCohortEnrollment,
  listCohortEnrollments,
  listEnrollmentsForLearner,
  findCohortEnrollmentById,
  markDropped,
  findCohort,
  findCohortSchedulingMode,
  countActiveCohortEnrollments,
  findCohortCapacityPolicy,
};
