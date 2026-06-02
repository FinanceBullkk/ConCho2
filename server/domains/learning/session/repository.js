const Schedule = require('../../../models/Schedule');
const Class = require('../../../models/Class');
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

module.exports = { findSessions, findSessionById, findCohortIdsByTeacher };
