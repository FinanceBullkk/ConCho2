const Enrollment = require('../../../models/Enrollment');
const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');

// learning/enrollment/repository — MONGO impl. Reads scoped to cohort-based
// enrollments (teamId = null). insertActiveEnrollment is the shared create spine
// for BOTH modes. (Was repository.js; split into mongo/pg behind a DB_BACKEND
// selector in the Phase-3 Wave-B port — behaviour-preserving.)

const findActiveCohortEnrollment = (userId, cohortId) =>
  Enrollment.findOne({ userId, classId: cohortId, teamId: null, status: 'Active' }).lean();

// The one create for both modes. Transaction-aware for the team-sync/transfer
// transactions; `joinedAt` is optional (the model defaults it) — the team path
// passes an explicit timestamp so every row in one sync shares it.
// `handle` (#255) is either a raw mongoose session (legacy) or the UoW tx
// handle ({session} on Mongo / {client} on PG — the latter is ignored here).
const insertActiveEnrollment = async ({ userId, classId = null, teamId = null, joinedAt }, handle = null) => {
  const session = handle && typeof handle.startTransaction === 'function'
    ? handle            // raw mongoose ClientSession
    : handle?.session;  // UoW tx handle (undefined for {client}/null)
  const doc = { userId, classId, teamId, status: 'Active' };
  if (joinedAt) doc.joinedAt = joinedAt;
  const [created] = await Enrollment.create([doc], session ? { session } : {});
  return created.toObject();
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
  insertActiveEnrollment,
  listCohortEnrollments,
  listEnrollmentsForLearner,
  findCohortEnrollmentById,
  markDropped,
  findCohort,
  findCohortSchedulingMode,
  countActiveCohortEnrollments,
  findCohortCapacityPolicy,
};
