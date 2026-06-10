const Schedule = require('../../../models/Schedule');
const Class = require('../../../models/Class');
const LearningProgram = require('../../../models/LearningProgram');
const Enrollment = require('../../../models/Enrollment');
const Office = require('../../../models/Office');
const {
  attachSessionNumbers,
  invalidateSessionOrderCache,
} = require('../../schedule/session-order');

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

const getClassId = (session) => session.classId?._id || session.classId;

const findSessions = async (filter, { skip, limit }) => {
  const [sessions, total] = await Promise.all([
    populateSessionQuery(Schedule.find(filter))
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Schedule.countDocuments(filter),
  ]);

  sessions.forEach((session) => invalidateSessionOrderCache(getClassId(session)));
  await attachSessionNumbers(sessions);
  return { sessions, total };
};

const findSessionById = async (id) => {
  const session = await populateSessionQuery(Schedule.findById(id))
    .lean({ virtuals: true });
  if (!session) return null;
  invalidateSessionOrderCache(getClassId(session));
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

module.exports = {
  findSessions,
  findSessionById,
  findCohortIdsByTeacher,
  findSchedulingContextByCohort,
  findActiveCohortLearnerIds,
  findOfficeById,
};
