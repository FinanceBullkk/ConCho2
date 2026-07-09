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

// ── Legacy /api/enrollments admin overrides (Phase 5 slice 4, B2-tail) ──────
// By-id status/note writes for EITHER mode (team or cohort) + the reads the
// status handlers need. tx-aware via sessionOf-style option passing.
const sessionOpt = (tx) => (tx && tx.session ? { session: tx.session } : {});

const findEnrollmentByIdLean = (id) => Enrollment.findById(id).lean();

const updateEnrollmentById = (id, patch, tx) =>
  Enrollment.findByIdAndUpdate(id, patch, { new: true, runValidators: true, ...sessionOpt(tx) });

const findEnrollmentUserIdsByIds = (ids) =>
  Enrollment.find({ _id: { $in: ids } }, { userId: 1 }).lean();

const bulkUpdateEnrollmentsByIds = async (ids, patch, tx) => {
  const res = await Enrollment.updateMany({ _id: { $in: ids } }, patch, sessionOpt(tx));
  return { modifiedCount: res.modifiedCount };
};

// Post-commit response re-fetch (populate does not run inside transactions).
const findEnrollmentByIdPopulated = (id) =>
  Enrollment.findById(id)
    .populate('userId', 'empCode name department status')
    .populate('teamId', 'name')
    .populate('classId', 'classCode courseName totalSessions')
    .populate('transferredTo', 'name');

// ── Legacy /api/enrollments list reads (K1b slice 3) ────────────────────────
// The read handlers behind /api/enrollments, /team/:id, /user/:id and
// /check-conflicts. Each spans BOTH modes (team + cohort) with the same 4-way
// populate; ported here (not the cohort-scoped listCohortEnrollments) so
// DB_BACKEND selects Postgres once Mongo is retired. Behaviour-preserving:
// same filters, populate select lists, sort, lean.

// GET /api/enrollments — optional teamId/userId/status/classId filters.
const listEnrollments = ({ teamId, userId, status, classId } = {}) => {
  const filter = {};
  if (teamId) filter.teamId = teamId;
  if (userId) filter.userId = userId;
  if (status) filter.status = status;
  if (classId) filter.classId = classId;
  return Enrollment.find(filter)
    .populate('userId', 'empCode name department status')
    .populate('teamId', 'name')
    .populate('classId', 'classCode courseName totalSessions')
    .populate('transferredTo', 'name')
    .sort({ joinedAt: -1 })
    .lean();
};

// GET /api/enrollments/team/:teamId — team populate carries classId (the ref).
const listTeamEnrollments = ({ teamId, status }) => {
  const filter = { teamId };
  if (status && status !== 'All') filter.status = status;
  return Enrollment.find(filter)
    .populate('userId', 'empCode name department status')
    .populate('teamId', 'name classId')
    .populate('classId', 'classCode courseName totalSessions')
    .populate('transferredTo', 'name')
    .sort({ status: 1, joinedAt: -1 })
    .lean();
};

// GET /api/enrollments/user/:userId — one learner's full timeline.
const listUserEnrollments = (userId) =>
  Enrollment.find({ userId })
    .populate('userId', 'empCode name department status')
    .populate('teamId', 'name')
    .populate('classId', 'classCode courseName totalSessions')
    .populate('transferredTo', 'name')
    .sort({ joinedAt: -1 })
    .lean();

// POST /api/enrollments/check-conflicts — Active enrollments for these users in
// a team OTHER than the target. $ne includes teamId:null rows (cohort mode) to
// match Mongo semantics; the PG twin uses IS DISTINCT FROM.
const findActiveConflicts = ({ memberIds, teamId }) =>
  Enrollment.find({ userId: { $in: memberIds }, status: 'Active', teamId: { $ne: teamId } })
    .populate('userId', 'empCode name department')
    .populate('teamId', 'name')
    .lean();

module.exports = {
  findActiveCohortEnrollment,
  insertActiveEnrollment,
  listCohortEnrollments,
  listEnrollmentsForLearner,
  findCohortEnrollmentById,
  markDropped,
  findEnrollmentByIdLean,
  updateEnrollmentById,
  findEnrollmentUserIdsByIds,
  bulkUpdateEnrollmentsByIds,
  findEnrollmentByIdPopulated,
  listEnrollments,
  listTeamEnrollments,
  listUserEnrollments,
  findActiveConflicts,
  findCohort,
  findCohortSchedulingMode,
  countActiveCohortEnrollments,
  findCohortCapacityPolicy,
};
