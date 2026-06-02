const scheduleService = require('../../../services/scheduleService');
const { sessionDto } = require('./dto');
const repository = require('./repository');

const buildFilter = async (query = {}, requestUser) => {
  const filter = {};
  const cohortId = query.cohortId || query.classId;
  const groupId = query.groupId || query.bookedTeamId;

  if (cohortId) filter.classId = cohortId;
  if (groupId) filter.bookedTeamId = groupId;
  if (query.from || query.to) {
    filter.startTime = {};
    if (query.from) filter.startTime.$gte = new Date(query.from);
    if (query.to) filter.startTime.$lte = new Date(query.to);
  }
  if (requestUser?.role === 'Participant') {
    filter.enrolledUsers = requestUser._id;
  }
  if (requestUser?.role === 'Teacher') {
    const cohortIds = await repository.findCohortIdsByTeacher(requestUser._id);
    const allowedIds = cohortIds.map((id) => id.toString());
    if (filter.classId && !allowedIds.includes(filter.classId.toString())) {
      filter.classId = { $in: [] };
    } else if (!filter.classId) {
      filter.classId = { $in: cohortIds };
    }
  }

  return filter;
};

const listSessions = async (query, pagination, requestUser) => {
  const { sessions, total } = await repository.findSessions(
    await buildFilter(query, requestUser),
    pagination,
  );
  return { data: sessions.map(sessionDto), total };
};

const getSession = async (id, requestUser) => {
  const session = await repository.findSessionById(id);
  if (!session) return null;

  if (requestUser?.role === 'Participant') {
    const enrolled = (session.enrolledUsers || []).some(
      (learner) => learner?._id?.toString() === requestUser._id.toString(),
    );
    if (!enrolled) {
      throw new scheduleService.ServiceError('Not authorized to view this session', 403);
    }
  }
  if (requestUser?.role === 'Teacher') {
    const assigned = (session.classId?.teacherIds || []).some(
      (teacherId) => teacherId?.toString() === requestUser._id.toString(),
    );
    if (!assigned) {
      throw new scheduleService.ServiceError('Not authorized to view this session', 403);
    }
  }

  return sessionDto(session);
};

const bookSession = async (payload, requestUser) => {
  const created = await scheduleService.bookSlot({
    teamId: payload.groupId,
    startTime: payload.startTime,
    endTime: payload.endTime,
    requestUser,
  });
  return getSession(created._id, requestUser);
};

const cancelSession = (id, requestUser) => scheduleService.cancelSlot(id, requestUser);

module.exports = {
  listSessions,
  getSession,
  bookSession,
  cancelSession,
};
