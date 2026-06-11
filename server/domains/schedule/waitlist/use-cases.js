const { ServiceError } = require('../../../helpers/ServiceError');
const scheduleRepository = require('../repository');
const bookingPolicy = require('../session-booking-policy');
const policy = require('./policy');
const repository = require('./repository');

// ──────────────────────────────────────────────────────────
// Waitlist use-cases (Wave E3 phase-04, slice B)
// ──────────────────────────────────────────────────────────
// join  — self-join the FIFO queue of a FULL, future, live session the actor
//         belongs to (team member OR active cohort enrollee). Free seats →
//         409 (owner decision: the waitlist never instant-seats).
// leave — withdraw my own waiting entry.
// listForSchedule — staff view (Admin all; Teacher class-scoped).
// listMine — my live entries + FIFO position (learner UI).

const effectiveCapacityFor = async (schedule) => {
  const { maxParticipantsPerSession } =
    await scheduleRepository.findClassCapacityPolicy(schedule.classId);
  return bookingPolicy.effectiveSessionCapacity({
    scheduleCapacity: schedule.capacity,
    maxPerSession: maxParticipantsPerSession,
  });
};

const join = async (scheduleId, actor) => {
  const schedule = await repository.findScheduleForJoin(scheduleId);
  if (!schedule) throw new ServiceError('Session not found', 404);

  // Audience scope: team member (team modes) OR active cohort enrollee.
  const team = schedule.bookedTeamId
    ? await repository.findTeamMembers(schedule.bookedTeamId)
    : null;
  const hasCohortEnrollment = schedule.bookedTeamId
    ? false
    : await repository.hasActiveCohortEnrollment(schedule.classId, actor._id);
  const scope = policy.isSessionAudience(actor, { team, hasCohortEnrollment });
  if (!scope.allowed) throw new ServiceError(scope.reason, 403);

  // Session preconditions (live + future + full + not already enrolled).
  const effectiveCapacity = await effectiveCapacityFor(schedule);
  const pre = policy.canJoinSession(schedule, { effectiveCapacity, actorId: actor._id });
  if (!pre.allowed) throw new ServiceError(pre.reason, pre.statusCode);

  // Friendly pre-check; the partial-unique {scheduleId,userId} where
  // status:'waiting' index is the real concurrent double-join guard.
  if (await repository.findMyWaitingEntry(scheduleId, actor._id)) {
    throw new ServiceError('You are already on this waitlist', 409);
  }

  let entry;
  try {
    entry = await repository.createEntry({
      scheduleId,
      classId: schedule.classId,
      userId: actor._id,
      joinedBy: actor._id,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ServiceError('You are already on this waitlist', 409);
    }
    throw err;
  }

  const position = await repository.positionOf(entry);
  return { entry, position };
};

const leave = async (scheduleId, actor) => {
  const entry = await repository.withdrawMyEntry(scheduleId, actor._id);
  if (!entry) throw new ServiceError('You are not on this waitlist', 404);
  return entry;
};

const listForSchedule = async (scheduleId, actor) => {
  const schedule = await repository.findScheduleForJoin(scheduleId);
  if (!schedule) throw new ServiceError('Session not found', 404);

  if (actor.role === 'Teacher') {
    const allowed = await repository.isTeacherAllowedForClass(schedule.classId, actor._id);
    if (!allowed) throw new ServiceError('Not authorized to view this waitlist', 403);
  }

  const entries = await repository.listEntriesForSchedule(scheduleId);
  // FIFO position among the still-waiting rows (history rows carry none).
  let waitingSeen = 0;
  return entries.map((e) => ({
    ...e,
    position: e.status === 'waiting' ? ++waitingSeen : null,
  }));
};

const listMine = async (actor) => {
  const entries = await repository.listMyWaitingEntries(actor._id);
  const withPositions = [];
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop -- a learner has few live entries
    const position = await repository.positionOf(entry);
    withPositions.push({ ...entry, position });
  }
  return withPositions;
};

module.exports = { join, leave, listForSchedule, listMine };
