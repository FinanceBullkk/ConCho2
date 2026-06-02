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

// Scheduling modes with a working booking flow today:
//   - leader_booking: the team leader (or an Admin) books for the team.
//   - admin_scheduled: only an Admin books; leaders/participants cannot.
// self_enroll and nomination need per-learner enrollment (cohort-based, not
// team-based) which does not exist yet — they stay gated with a clear 501 until
// that enrollment work lands.
const SUPPORTED_SCHEDULING_MODES = new Set(['leader_booking', 'admin_scheduled']);

const bookSession = async (payload, requestUser) => {
  const { schedulingMode } = await repository.findSchedulingContextByGroup(payload.groupId);

  if (!SUPPORTED_SCHEDULING_MODES.has(schedulingMode)) {
    throw new scheduleService.ServiceError(
      `Scheduling mode '${schedulingMode}' is not supported yet`,
      501,
    );
  }

  // admin_scheduled: the program is scheduled by Admins only — a team leader
  // must not self-book here (the key difference from leader_booking).
  if (schedulingMode === 'admin_scheduled' && requestUser?.role !== 'Admin') {
    throw new scheduleService.ServiceError(
      'This program is admin-scheduled — only an Admin can create its sessions',
      403,
    );
  }

  // bookSlot already lets an Admin book for any team (it only enforces the
  // leader check for non-admins), so it serves both supported modes.
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
