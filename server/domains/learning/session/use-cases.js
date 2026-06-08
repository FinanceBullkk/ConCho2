const scheduleService = require('../../../services/scheduleService');
const schedulingWindowPolicy = require('../../schedule/scheduling-window-policy');
const schedulingModePolicy = require('../../schedule/scheduling-mode-policy');
const { sessionDto } = require('./dto');
const repository = require('./repository');

// Wave E1: safe, read-only scheduling config (allowed windows + timezone +
// weekly cap). Exposed to ALL authenticated roles so Participant/Teacher booking
// grids stop falling back to a hard-coded fixed-hour slot list. General
// /api/settings stays Admin-only — this returns ONLY scheduling data.
const getSchedulingConfig = () => schedulingWindowPolicy.getConfigDto();

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

// Scheduling modes split by how a session is created:
//   Team-based (book against a Group/Team): leader_booking | admin_scheduled.
//   Cohort-based (book against a Cohort, no team): self_enroll | nomination.
// The mode SETS + the team/cohort gate live in
// domains/schedule/scheduling-mode-policy (shared with the legacy booking paths)
// so there is one rule set, not two.

// Team-based booking (groupId): leader_booking / admin_scheduled.
const bookGroupSession = async (payload, requestUser) => {
  // The schedulingMode gate (team mode + admin_scheduled authz) is enforced by
  // scheduleService.bookSlot — the shared chokepoint for both this adapter and
  // the legacy /api/schedules/book-slot route — so it is not re-checked here.
  const created = await scheduleService.bookSlot({
    teamId: payload.groupId,
    startTime: payload.startTime,
    endTime: payload.endTime,
    requestUser,
  });
  return getSession(created._id, requestUser);
};

// Cohort-based booking (cohortId): self_enroll / nomination. Admin-only; the
// session snapshots the cohort's active cohort-based enrollments.
const bookCohortSession = async (payload, requestUser) => {
  if (requestUser?.role !== 'Admin') {
    throw new scheduleService.ServiceError(
      'Only an Admin can schedule sessions for this program',
      403,
    );
  }

  const { schedulingMode, cohortId } = await repository.findSchedulingContextByCohort(payload.cohortId);
  if (!cohortId) {
    throw new scheduleService.ServiceError('Cohort not found', 404);
  }
  schedulingModePolicy.assertCohortMode({ schedulingMode });

  const enrolledUserIds = await repository.findActiveCohortLearnerIds(payload.cohortId);
  const created = await scheduleService.bookCohortSlot({
    cohortId: payload.cohortId,
    startTime: payload.startTime,
    endTime: payload.endTime,
    enrolledUserIds,
    requestUser,
  });
  return getSession(created._id, requestUser);
};

const bookSession = (payload, requestUser) =>
  (payload.cohortId
    ? bookCohortSession(payload, requestUser)
    : bookGroupSession(payload, requestUser));

const cancelSession = (id, requestUser) => scheduleService.cancelSlot(id, requestUser);

module.exports = {
  listSessions,
  getSession,
  getSchedulingConfig,
  bookSession,
  cancelSession,
};
