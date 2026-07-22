const repository = require('./repository');
const writes = require('./writes');
const { assertPrerequisitesMet } = require('./prerequisites');
const { ServiceError } = require('../../../helpers/ServiceError');

const sameId = (a, b) => a && b && a.toString() === b.toString();

// Enroll a learner into a cohort.
//   - Admin may enroll any learner.
//   - A non-admin may only enroll themselves, and only when the cohort's
//     program is self-enroll (schedulingMode === 'self_enroll').
const enroll = async ({ cohortId, userId, startSessionNumber }, actor) => {
  const targetUserId = userId || actor._id.toString();
  const isSelf = sameId(targetUserId, actor._id);

  if (!['Admin', 'Coordinator'].includes(actor.role)) {
    if (!isSelf) {
      throw new ServiceError('Not authorized to enroll another learner', 403);
    }
    const mode = await repository.findCohortSchedulingMode(cohortId);
    if (mode !== 'self_enroll') {
      throw new ServiceError('This program does not allow self-enrollment', 403);
    }
  }

  const cohort = await repository.findCohort(cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }
  if (startSessionNumber != null && cohort.totalSessions != null && startSessionNumber > cohort.totalSessions) {
    throw new ServiceError('startSessionNumber cannot exceed the cohort session count', 400);
  }

  const existing = await repository.findActiveCohortEnrollment(targetUserId, cohortId);
  if (existing) {
    throw new ServiceError('Learner is already enrolled in this cohort', 409);
  }

  // Per-cohort total capacity (Wave E2): when the program sets a
  // capacityPolicy.maxParticipants, a cohort cannot exceed it. Applies to ALL
  // roles (a data-integrity cap, not a self-enroll gate) — raise the program cap
  // to admit more. App-level count check: the partial unique index prevents
  // duplicate enrollments, not overflow, so a rare concurrent race past the cap
  // is a documented limitation (strict enforcement would need a tx lock).
  const { maxParticipants } = await repository.findCohortCapacityPolicy(cohortId);
  if (maxParticipants != null) {
    const activeCount = await repository.countActiveCohortEnrollments(cohortId);
    if (activeCount >= maxParticipants) {
      throw new ServiceError(
        `This cohort is full (capacity ${maxParticipants})`,
        422,
      );
    }
  }

  // Prerequisite gating applies to self-enrollment; Admins may override.
  if (!['Admin', 'Coordinator'].includes(actor.role)) {
    await assertPrerequisitesMet(cohort, targetUserId);
  }

  let enrollment;
  try {
    enrollment = await writes.createActiveEnrollment({
      userId: targetUserId,
      classId: cohortId,
      teamId: null,
      startSessionNumber,
    });
  } catch (error) {
    // Lost a concurrent race against the partial unique index (DI-05b): the
    // app-level check above passed for both callers, only one insert wins.
    if (error && error.code === 11000) {
      throw new ServiceError('Learner is already enrolled in this cohort', 409);
    }
    throw error;
  }

  // Cross-cutting side effects (the cohort_enrolled bell row) react to this
  // domain event in domains/notification/subscribers.js — the write spine emits
  // it AFTER the row persists; the subscriber skips self-enroll.
  await writes.announceEnrollmentCreated(enrollment, cohort, { actorIsSelf: isSelf });

  return enrollment;
};

// Withdraw (soft) a cohort enrollment: status -> Dropped. Admin or the learner.
const withdraw = async (id, actor) => {
  const before = await repository.findCohortEnrollmentById(id);
  if (!before) {
    throw new ServiceError('Cohort enrollment not found', 404);
  }
  if (!['Admin', 'Coordinator'].includes(actor.role) && !sameId(before.userId, actor._id)) {
    throw new ServiceError('Not authorized to withdraw this enrollment', 403);
  }
  if (before.status !== 'Active') {
    throw new ServiceError('Enrollment is not active', 409);
  }
  const after = await repository.markDropped(id);
  return { before, after };
};

const list = async ({ cohortId, learnerId }, actor) => {
  if (actor.role === 'Teacher' && cohortId) {
    const cohort = await repository.findCohort(cohortId);
    if (!cohort) throw new ServiceError('Cohort not found', 404);
    if (cohort.programCategory === 'english'
      && !cohort.teacherIds.some((teacherId) => sameId(teacherId, actor._id))) {
      throw new ServiceError('You are not assigned to this English course run', 403);
    }
  }
  // Participants only ever see their own enrollments.
  const scopedLearner = actor.role === 'Participant' ? actor._id.toString() : learnerId;
  return repository.listCohortEnrollments({ cohortId, learnerId: scopedLearner });
};

// Unified self read (converge Phase 2): the actor's enrollments across BOTH
// modes (team-based group enrollment + direct cohort enrollment) in one list.
// Always scoped to the actor — there is no cross-learner read path here.
const getMyEnrollments = (actor) =>
  repository.listEnrollmentsForLearner(actor._id);

// Enroll many learners into one cohort in a single Admin action (Phase 3 — closes
// the M2 "bulk enrollment" deferral). Partial-success by design: each learner is
// attempted independently and a per-learner skip reason is collected rather than
// failing the whole batch. Admin-only at the route (`enrollment.manage`), so no
// self-enroll / prerequisite gating applies (Admins override prerequisites, same
// as single enroll). Cohort + capacity policy are fetched ONCE, not per learner.
const bulkEnroll = async ({ cohortId, userIds, startSessionNumber }, actor) => {
  const cohort = await repository.findCohort(cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }
  if (startSessionNumber != null && cohort.totalSessions != null && startSessionNumber > cohort.totalSessions) {
    throw new ServiceError('startSessionNumber cannot exceed the cohort session count', 400);
  }

  const { maxParticipants } = await repository.findCohortCapacityPolicy(cohortId);
  // Live count, incremented locally as we admit learners so the cap holds across
  // the loop without re-counting each iteration.
  let activeCount = maxParticipants != null
    ? await repository.countActiveCohortEnrollments(cohortId)
    : 0;

  const enrolled = [];
  const skipped = [];
  // De-dupe the incoming list (a learner listed twice is enrolled once).
  const unique = [...new Set((userIds || []).map(String))];

  for (const userId of unique) {
    if (maxParticipants != null && activeCount >= maxParticipants) {
      skipped.push({ userId, reason: 'cohort_full' });
      continue;
    }
    if (await repository.findActiveCohortEnrollment(userId, cohortId)) {
      skipped.push({ userId, reason: 'already_enrolled' });
      continue;
    }
    try {
      const enrollment = await writes.createActiveEnrollment({
        userId,
        classId: cohortId,
        teamId: null,
        startSessionNumber,
      });
      enrolled.push(enrollment);
      activeCount += 1;
      // Admin-initiated (never self) → emit; the notification subscriber writes
      // the cohort_enrolled bell row (DRY with single enroll).
      await writes.announceEnrollmentCreated(enrollment, cohort, { actorIsSelf: false });
    } catch (error) {
      // Lost the partial-unique race (someone enrolled them concurrently).
      if (error && error.code === 11000) {
        skipped.push({ userId, reason: 'already_enrolled' });
        continue;
      }
      throw error;
    }
  }

  return { enrolled, skipped };
};

module.exports = { enroll, withdraw, list, getMyEnrollments, bulkEnroll };
