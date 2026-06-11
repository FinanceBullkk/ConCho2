const Schedule = require('../../../models/Schedule');
const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');
const Enrollment = require('../../../models/Enrollment');
const Team = require('../../../models/Team');
const Office = require('../../../models/Office');
const { attachSessionNumbers } = require('../../schedule/session-order');

const populateSessionQuery = (query) => query
  .populate({
    path: 'classId',
    select: 'classCode courseName programId totalSessions status teacherIds createdAt updatedAt',
    populate: { path: 'programId' },
  })
  .populate({
    path: 'bookedTeamId',
    select: 'name leaderId classId',
  })
  .populate('officeId', 'name code')
  .populate('roomId', 'name code')
  .populate('sessionInstructorIds', 'empCode name')
  .populate('enrolledUsers', 'empCode name department status');

// PERF-014 (audit round 4): these READ paths used to call
// invalidateSessionOrderCache(classId) before attachSessionNumbers, which
// deleted the cache entry on every read → guaranteed miss + an extra
// Schedule.find per list/detail, and thrash for entries other paths warmed.
// Invalidation belongs ONLY on write paths (create/cancel/reassign), which all
// already do it (scheduleService bookSlot/bookCohortSlot/adminCreate/cancel;
// domains/schedule/use-cases reassign/delete). Reads now read-through the cache
// and recompute only on a miss.
const findSessions = async (filter, { skip, limit }) => {
  const [sessions, total] = await Promise.all([
    populateSessionQuery(Schedule.find(filter))
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Schedule.countDocuments(filter),
  ]);

  await attachSessionNumbers(sessions);
  return { sessions, total };
};

const findSessionById = async (id) => {
  const session = await populateSessionQuery(Schedule.findById(id))
    .lean({ virtuals: true });
  if (!session) return null;
  const [withNumber] = await attachSessionNumbers([session]);
  return withNumber;
};

const findCohortIdsByTeacher = async (teacherId) => {
  const rows = await Class.find({ teacherIds: teacherId }).select('_id').lean();
  return rows.map((row) => row._id);
};

// Resolve the scheduling mode directly from a Cohort (Class) — used by the
// cohort-based booking path (self_enroll / nomination), which has no Team.
// Chain: Class(cohort).programId -> LearningProgram.schedulingMode.
// Falls back to 'leader_booking' when the cohort has no linked program.
const findSchedulingContextByCohort = async (cohortId) => {
  const fallback = { schedulingMode: 'leader_booking', programId: null, cohortId };

  const cohort = await Class.findById(cohortId).select('programId isDeleted').lean();
  if (!cohort) return { ...fallback, cohortId: null };
  if (!cohort.programId) return fallback;

  const program = await LearningProgram.findById(cohort.programId).select('schedulingMode').lean();
  return {
    schedulingMode: program?.schedulingMode || 'leader_booking',
    programId: cohort.programId,
    cohortId,
  };
};

// Live Office lookup — used to validate the officeId a coordinator picks when
// scheduling an offline session (re-center Phase 2).
const findOfficeById = (officeId) => Office.findOne({ _id: officeId, isDeleted: false }).lean();

// Active cohort-based enrollments (teamId:null) for a cohort -> learner ids.
// These are the learners a self_enroll/nomination session enrols at creation.
const findActiveCohortLearnerIds = async (cohortId) => {
  const rows = await Enrollment.find({
    classId: cohortId,
    teamId: null,
    status: 'Active',
  }).select('userId').lean();
  return rows.map((row) => row.userId);
};

// The inverse: cohorts a learner is actively cohort-enrolled in (teamId:null).
// Powers the phase-04 visibility widening — a late enrollee must SEE their
// cohort's sessions (incl. full ones) to join a waitlist.
const findActiveCohortIdsForLearner = (userId) =>
  Enrollment.find({ userId, teamId: null, status: 'Active' }).distinct('classId');

// Teams the learner belongs to — the team-mode arm of the same widening: a
// member NOT on a full team session's roster (their add was capacity-blocked)
// must still see that session to join its waitlist. isDeleted is filtered
// explicitly because Team's soft-delete pre-hooks don't cover `distinct`.
const findTeamIdsForMember = (userId) =>
  Team.find({ members: userId, isDeleted: { $ne: true } }).distinct('_id');

// Program per-session caps for a set of cohorts (one query) — lets the list
// endpoint attach an honest effectiveCapacity per session row.
const findCapacityPoliciesByCohortIds = async (cohortIds) => {
  if (!cohortIds.length) return new Map();
  const classes = await Class.find({ _id: { $in: cohortIds } })
    .select('programId').lean();
  const programIds = [...new Set(classes.map((c) => String(c.programId)).filter((p) => p !== 'null' && p !== 'undefined'))];
  const programs = programIds.length
    ? await LearningProgram.find({ _id: { $in: programIds } })
      .select('capacityPolicy').lean()
    : [];
  const programCap = new Map(programs.map((p) => [String(p._id), p.capacityPolicy?.maxParticipantsPerSession ?? null]));
  return new Map(classes.map((c) => [
    String(c._id),
    c.programId ? (programCap.get(String(c.programId)) ?? null) : null,
  ]));
};

module.exports = {
  findSessions,
  findSessionById,
  findCohortIdsByTeacher,
  findSchedulingContextByCohort,
  findActiveCohortLearnerIds,
  findActiveCohortIdsForLearner,
  findTeamIdsForMember,
  findCapacityPoliciesByCohortIds,
  findOfficeById,
};
