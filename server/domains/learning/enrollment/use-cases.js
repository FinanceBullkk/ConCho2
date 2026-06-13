const repository = require('./repository');
const { assertPrerequisitesMet } = require('./prerequisites');
const { recordInApp } = require('../../notification/in-app-writer');
const { ServiceError } = require('../../../helpers/ServiceError');

const sameId = (a, b) => a && b && a.toString() === b.toString();

// Enroll a learner into a cohort.
//   - Admin may enroll any learner.
//   - A non-admin may only enroll themselves, and only when the cohort's
//     program is self-enroll (schedulingMode === 'self_enroll').
const enroll = async ({ cohortId, userId }, actor) => {
  const targetUserId = userId || actor._id.toString();
  const isSelf = sameId(targetUserId, actor._id);

  if (actor.role !== 'Admin') {
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
  if (actor.role !== 'Admin') {
    await assertPrerequisitesMet(cohort, targetUserId);
  }

  let enrollment;
  try {
    enrollment = await repository.createCohortEnrollment({ userId: targetUserId, cohortId });
  } catch (error) {
    // Lost a concurrent race against the partial unique index (DI-05b): the
    // app-level check above passed for both callers, only one insert wins.
    if (error && error.code === 11000) {
      throw new ServiceError('Learner is already enrolled in this cohort', 409);
    }
    throw error;
  }

  // Surface a direct enrollment in the learner's notification bell — only when
  // someone ELSE enrolled them (Admin); self-enroll already confirms in the UI.
  // In-app only (no email), fail-soft + idempotent on the enrollment id.
  if (!isSelf) {
    await recordInApp({
      type: 'cohort_enrolled',
      recipientUserId: targetUserId,
      cadenceKey: String(enrollment._id),
      metadata: {
        programName: cohort.courseName,
        cohortCode: cohort.classCode,
        cohortId: String(cohortId),
      },
    });
  }

  return enrollment;
};

// Withdraw (soft) a cohort enrollment: status -> Dropped. Admin or the learner.
const withdraw = async (id, actor) => {
  const before = await repository.findCohortEnrollmentById(id);
  if (!before) {
    throw new ServiceError('Cohort enrollment not found', 404);
  }
  if (actor.role !== 'Admin' && !sameId(before.userId, actor._id)) {
    throw new ServiceError('Not authorized to withdraw this enrollment', 403);
  }
  if (before.status !== 'Active') {
    throw new ServiceError('Enrollment is not active', 409);
  }
  const after = await repository.markDropped(id);
  return { before, after };
};

const list = ({ cohortId, learnerId }, actor) => {
  // Participants only ever see their own enrollments.
  const scopedLearner = actor.role === 'Participant' ? actor._id.toString() : learnerId;
  return repository.listCohortEnrollments({ cohortId, learnerId: scopedLearner });
};

module.exports = { enroll, withdraw, list };
