const scheduleService = require('../../../services/scheduleService');
const schedulingWindowPolicy = require('../../schedule/scheduling-window-policy');
const schedulingModePolicy = require('../../schedule/scheduling-mode-policy');
const {
  isCohortAssignedOnly, assignedOnlyCohortIdSet,
} = require('../../schedule/facilitator-visibility-policy');
const { effectiveSessionCapacity } = require('../../schedule/session-booking-policy');
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
    // Phase-04 slice B widening: a learner sees the sessions they're enrolled
    // in PLUS every session of cohorts they're actively cohort-enrolled in
    // PLUS every session of teams they belong to — a late cohort enrollee OR
    // a team member whose add was blocked by capacity must still SEE the full
    // session to join its waitlist (review fix F4: the join API already
    // admits team members; the list must show them the session).
    const [myCohortIds, myTeamIds] = await Promise.all([
      repository.findActiveCohortIdsForLearner(requestUser._id),
      repository.findTeamIdsForMember(requestUser._id),
    ]);
    filter.$or = [
      { enrolledUsers: requestUser._id },
      ...(myCohortIds.length ? [{ classId: { $in: myCohortIds } }] : []),
      ...(myTeamIds.length ? [{ bookedTeamId: { $in: myTeamIds } }] : []),
    ];
    // Learners never see durable-cancelled sessions (phase-04 slice A, NF3).
    filter.status = 'scheduled';
  }
  if (requestUser?.role === 'Teacher') {
    const cohortIds = await repository.findCohortIdsByTeacher(requestUser._id);
    const allowedIds = cohortIds.map((id) => id.toString());
    // facilitatorPolicy.visibility === 'assigned_only': the standing cohort
    // binding does NOT reveal a program's sessions — only the ones the teacher
    // is named on. So those cohorts drop out of the binding-based clause.
    const assignedOnlyIds = await assignedOnlyCohortIdSet(cohortIds);
    // UNION widening (Wave E polish): a teacher who is NOT bound to the cohort
    // but IS a named session instructor still finds the sessions they run —
    // parity with the single-session read (Phase 3 DELTA B). The cohort scope
    // itself stays RESTRICTIVE (no empty-teacherIds flip).
    if (filter.classId
      && (!allowedIds.includes(filter.classId.toString())
        || assignedOnlyIds.has(filter.classId.toString()))) {
      // Foreign OR assigned_only cohort: only the sessions they personally run.
      filter.sessionInstructorIds = requestUser._id;
    } else if (!filter.classId) {
      // Open bound cohorts (full visibility) ∪ named-instructor sessions.
      const openCohortIds = cohortIds.filter((id) => !assignedOnlyIds.has(id.toString()));
      filter.$or = [
        { classId: { $in: openCohortIds } },
        { sessionInstructorIds: requestUser._id },
      ];
    }
    // Teachers run operational views — cancelled rows are noise there.
    filter.status = 'scheduled';
  }
  // Admin/Coordinator (schedulers) see cancelled rows too — the cohort
  // sessions panel renders them with a "Cancelled" chip as the history view.

  return filter;
};

const listSessions = async (query, pagination, requestUser) => {
  const { sessions, total } = await repository.findSessions(
    await buildFilter(query, requestUser),
    pagination,
  );

  // Attach the honest per-session cap (program override > field > default) so
  // clients can render fullness truthfully — needed by the waitlist UI
  // (phase-04 slice B: the Join button only shows on genuinely full sessions).
  const cohortIds = [...new Set(
    sessions.map((s) => String(s.classId?._id || s.classId)).filter(Boolean),
  )];
  const capByCohort = await repository.findCapacityPoliciesByCohortIds(cohortIds);
  const data = sessions.map((s) => ({
    ...sessionDto(s, requestUser),
    effectiveCapacity: effectiveSessionCapacity({
      scheduleCapacity: s.capacity,
      maxPerSession: capByCohort.get(String(s.classId?._id || s.classId)) ?? null,
    }),
  }));
  return { data, total };
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
    // UNION (Phase 3, DELTA B): a Teacher may view the session if assigned to
    // its cohort OR named as a session instructor. The cohort check is kept
    // RESTRICTIVE exactly as before (B1 — do NOT silently flip empty teacherIds
    // to permissive on session read); the override only ADDS named-instructor
    // access for this single session.
    const assigned = (session.classId?.teacherIds || []).some(
      (teacherId) => teacherId?.toString() === requestUser._id.toString(),
    );
    const isInstructor = (session.sessionInstructorIds || []).some(
      (id) => String(id?._id || id) === requestUser._id.toString(),
    );
    // assigned_only: the cohort binding does not grant read — require named.
    const assignedOnly = await isCohortAssignedOnly(session.classId?._id || session.classId);
    const allowed = assignedOnly ? isInstructor : (assigned || isInstructor);
    if (!allowed) {
      throw new scheduleService.ServiceError('Not authorized to view this session', 403);
    }
  }

  return sessionDto(session, requestUser);
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

// Cohort-based booking (cohortId): self_enroll / nomination. The
// coordinator-scheduled offline flow (re-center Phase 2): a scheduler (Admin or
// Coordinator) opens a session against a cohort at a physical Office; the roster
// comes from self-enrolment + assignment (the cohort's active cohort-based
// enrollments are snapshotted here). `officeId` is REQUIRED for this flow even
// though the column is nullable for legacy/online rows.
const bookCohortSession = async (payload, requestUser) => {
  if (!schedulingModePolicy.isScheduler(requestUser)) {
    throw new scheduleService.ServiceError(
      'Only a coordinator or admin can schedule sessions for this program',
      403,
    );
  }

  if (!payload.officeId) {
    throw new scheduleService.ServiceError(
      'officeId is required — a coordinator-scheduled session must pick an Office',
      400,
    );
  }
  const office = await repository.findOfficeById(payload.officeId);
  if (!office) {
    throw new scheduleService.ServiceError('Office not found', 422);
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
    officeId: payload.officeId,
    roomId: payload.roomId || null,
    requestUser,
  });
  return getSession(created._id, requestUser);
};

const bookSession = (payload, requestUser) =>
  (payload.cohortId
    ? bookCohortSession(payload, requestUser)
    : bookGroupSession(payload, requestUser));

const cancelSession = (id, requestUser, opts = {}) =>
  scheduleService.cancelSlot(id, requestUser, opts);

module.exports = {
  listSessions,
  getSession,
  getSchedulingConfig,
  bookSession,
  cancelSession,
};
