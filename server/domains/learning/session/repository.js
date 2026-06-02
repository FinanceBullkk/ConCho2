const Schedule = require('../../../models/Schedule');
const Class = require('../../../models/Class');
const Team = require('../../../models/Team');
const LearningProgram = require('../../../models/LearningProgram');
const {
  attachSessionNumbers,
  invalidateSessionOrderCache,
} = require('../../../services/scheduleService');

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

// Resolve the scheduling mode that governs how a group books sessions.
// Chain: Team(group) -> Class(cohort).programId -> LearningProgram.schedulingMode.
// Falls back to 'leader_booking' whenever program info is missing, so legacy
// cohorts without a programId keep their existing team-booking behaviour.
const findSchedulingContextByGroup = async (groupId) => {
  const fallback = { schedulingMode: 'leader_booking', programId: null, cohortId: null };

  const team = await Team.findById(groupId).select('classId').lean();
  if (!team || !team.classId) return fallback;

  const cohort = await Class.findById(team.classId).select('programId').lean();
  const programId = cohort?.programId || null;
  if (!programId) return { ...fallback, cohortId: team.classId };

  const program = await LearningProgram.findById(programId).select('schedulingMode').lean();
  return {
    schedulingMode: program?.schedulingMode || 'leader_booking',
    programId,
    cohortId: team.classId,
  };
};

module.exports = {
  findSessions,
  findSessionById,
  findCohortIdsByTeacher,
  findSchedulingContextByGroup,
};
