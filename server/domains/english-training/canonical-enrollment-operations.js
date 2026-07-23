const { ServiceError } = require('../../helpers/ServiceError');
const { nowVN } = require('../../helpers/dayjsConfig');
const repository = require('./canonical-operations-repository.pg');
const { AUTHORITY, normalizeLabel, auditActor, dateOnly } = require('./canonical-operations-shared');

// Canonical English enrollment lifecycle commands: create a class/Course Run,
// start a learner, mark a learner as left, and transfer a learner across
// classes. Every command is one PostgreSQL transaction with domain audit.

const createClassCourseRun = async (input, actor = {}) => {
  const classCode = normalizeLabel(input.classCode)?.toUpperCase();
  const displayName = normalizeLabel(input.displayName);
  const picLabel = normalizeLabel(input.picLabel);
  const picEmployeeId = input.picEmployeeId || null;

  if (!classCode || !displayName) throw new ServiceError('Class code and display name are required', 400);
  if (!picEmployeeId && !picLabel) throw new ServiceError('PIC employee or PIC team label is required', 400);

  try {
    return await repository.withTransaction(async (client) => {
      const course = await repository.findActiveCourse(input.courseId, client);
      if (!course) throw new ServiceError('Active English course not found', 404);

      const cohortId = repository.newId();
      const picAssignmentId = repository.newId();
      const courseRunId = repository.newId();
      const commonMeta = { authority: AUTHORITY, createdIn: 'English Operations' };

      await repository.createCohort({
        id: cohortId,
        classCode,
        displayName,
        status: input.status,
        capacity: input.capacity,
        meta: commonMeta,
      }, client);
      await repository.createPicAssignment({
        id: picAssignmentId,
        cohortId,
        picEmployeeId,
        picLabel,
        startDate: input.startDate,
        meta: commonMeta,
      }, client);
      await repository.createCourseRun({
        id: courseRunId,
        cohortId,
        courseId: course.id,
        status: input.status,
        expectedUnits: course.expected_units,
        maxAbsencesAllowed: course.max_absences_allowed,
        attendanceThresholdRatio: course.attendance_threshold_ratio,
        startDate: input.startDate,
      }, client);

      const auditBase = auditActor(actor);
      await repository.recordAudit({
        ...auditBase,
        action: 'cohort.create',
        entityType: 'cohort',
        entityKey: cohortId,
        details: { classCode, authority: AUTHORITY },
      }, client);
      await repository.recordAudit({
        ...auditBase,
        action: 'cohort.pic.assign',
        entityType: 'cohort_pic_assignment',
        entityKey: picAssignmentId,
        details: { cohortId, picEmployeeId, picLabel, authority: AUTHORITY },
      }, client);
      await repository.recordAudit({
        ...auditBase,
        action: 'course_run.create',
        entityType: 'course_run',
        entityKey: courseRunId,
        details: { cohortId, courseId: course.id, runNumber: 1, authority: AUTHORITY },
      }, client);

      return { cohortId, picAssignmentId, courseRunId, runNumber: 1 };
    });
  } catch (error) {
    if (error.code === '23505') throw new ServiceError(`English class code "${classCode}" already exists`, 409);
    if (error.code === '23503') throw new ServiceError('PIC employee not found', 404);
    throw error;
  }
};

const addRunEnrollment = async (input, actor = {}) => {
  try {
    return await repository.withTransaction(async (client) => {
      const run = await repository.findCourseRunForUpdate(input.courseRunId, client);
      if (!run) throw new ServiceError('English Course Run not found', 404);
      if (!['planned', 'active'].includes(run.status)) {
        throw new ServiceError('Learners can only join a planned or active English Course Run', 409);
      }
      const employee = await repository.findActiveEmployee(input.employeeId, client);
      if (!employee) throw new ServiceError('Active English employee not found', 404);

      const nextSessionNumber = await repository.getNextSessionNumber(run.id, client);
      if (Number(input.confirmedStartSessionNumber) !== nextSessionNumber) {
        throw new ServiceError('First applicable session changed; reload the roster before saving', 409);
      }
      const activeElsewhere = await repository.findActiveEnrollmentForEmployee(employee.id, client);
      if (activeElsewhere) {
        throw new ServiceError(
          `${employee.full_name} is already active in ${activeElsewhere.class_code} · ${activeElsewhere.course_name}`,
          409,
        );
      }
      if (await repository.findEnrollmentInRun(run.id, employee.id, client)) {
        throw new ServiceError('This employee already has an enrollment history in the Course Run', 409);
      }
      const activeCount = await repository.countActiveRunEnrollments(run.id, client);
      if (run.capacity && activeCount >= run.capacity) {
        throw new ServiceError(`Class capacity of ${run.capacity} has been reached`, 409);
      }

      let membership = await repository.findCurrentMembership(run.cohort_id, employee.id, client);
      let membershipCreated = false;
      if (!membership) {
        membership = await repository.createMembership({
          id: repository.newId(), cohortId: run.cohort_id,
          employeeId: employee.id, startDate: input.startDate,
        }, client);
        membershipCreated = true;
      }
      const enrollment = await repository.createRunEnrollment({
        id: repository.newId(), courseRunId: run.id, employeeId: employee.id,
        membershipId: membership.id, startSessionNumber: nextSessionNumber,
        businessUnit: employee.meta?.businessUnit || null,
        jobRole: employee.meta?.jobRole || null,
        meta: { authority: AUTHORITY, createdIn: 'English Operations' },
      }, client);
      await repository.recordAudit({
        ...auditActor(actor), action: 'run_enrollment.start',
        entityType: 'run_enrollment', entityKey: enrollment.id,
        details: {
          courseRunId: run.id, cohortId: run.cohort_id, employeeId: employee.id,
          membershipId: membership.id, membershipCreated,
          startSessionNumber: nextSessionNumber, startDate: input.startDate,
          authority: AUTHORITY,
        },
      }, client);
      return {
        enrollmentId: enrollment.id, membershipId: membership.id,
        membershipCreated, startSessionNumber: nextSessionNumber,
      };
    });
  } catch (error) {
    if (error.code === '23505') throw new ServiceError('Employee cannot be active in more than one English Course Run', 409);
    throw error;
  }
};

const leaveRunEnrollment = async (input, actor = {}) => repository.withTransaction(async (client) => {
  const run = await repository.findCourseRunForUpdate(input.courseRunId, client);
  if (!run) throw new ServiceError('English Course Run not found', 404);

  const enrollment = await repository.findRunEnrollmentForUpdate(
    input.courseRunId, input.enrollmentId, client,
  );
  if (!enrollment) throw new ServiceError('English Run Enrollment not found', 404);
  if (enrollment.status !== 'active') {
    throw new ServiceError('Only an active English Run Enrollment can be marked as left', 409);
  }
  if (enrollment.membership_status !== 'active') {
    throw new ServiceError('Active enrollment has no active English class membership', 409);
  }

  const membershipStartDate = dateOnly(enrollment.membership_start_date);
  if (membershipStartDate && input.lastActiveDate < membershipStartDate) {
    throw new ServiceError('Last active date cannot be before the English class membership started', 409);
  }
  if (input.lastActiveDate > nowVN().format('YYYY-MM-DD')) {
    throw new ServiceError('Last active date cannot be in the future', 409);
  }

  const dropped = await repository.dropRunEnrollment(input.enrollmentId, {
    lastActiveDate: input.lastActiveDate,
    reason: input.reason,
    authority: AUTHORITY,
  }, client);
  if (!dropped) throw new ServiceError('English Run Enrollment changed; reload before saving', 409);

  const endedMembership = await repository.endMembershipIfUnused(
    enrollment.cohort_membership_id, input.lastActiveDate, client,
  );
  const membershipEnded = Boolean(endedMembership);
  await repository.recordAudit({
    ...auditActor(actor), action: 'run_enrollment.leave',
    entityType: 'run_enrollment', entityKey: enrollment.id,
    details: {
      courseRunId: run.id, cohortId: run.cohort_id,
      employeeId: enrollment.employee_id,
      membershipId: enrollment.cohort_membership_id,
      beforeStatus: enrollment.status, afterStatus: dropped.status,
      lastActiveDate: input.lastActiveDate, reason: input.reason,
      membershipEnded, authority: AUTHORITY,
    },
  }, client);

  return {
    enrollmentId: enrollment.id,
    membershipId: enrollment.cohort_membership_id,
    before: { status: enrollment.status },
    after: { status: dropped.status, lastActiveDate: input.lastActiveDate },
    membershipEnded,
  };
});

const transferLearner = async (input, actor = {}) => {
  try {
    return await repository.withTransaction(async (client) => {
      if (input.targetCourseRunId === input.sourceCourseRunId) {
        throw new ServiceError('Transfer target must differ from the source Course Run', 400);
      }
      const targetRun = await repository.findCourseRunForUpdate(input.targetCourseRunId, client);
      if (!targetRun) throw new ServiceError('Target English Course Run not found', 404);
      if (!['planned', 'active'].includes(targetRun.status)) {
        throw new ServiceError('Transfer target must be a planned or active English Course Run', 409);
      }
      const nextSessionNumber = await repository.getTransferStartSessionNumber(targetRun.id, client);
      if (Number(input.confirmedStartSessionNumber) !== nextSessionNumber) {
        throw new ServiceError('First applicable session changed; reload the destination before saving', 409);
      }

      const sourceRun = await repository.findCourseRunForUpdate(input.sourceCourseRunId, client);
      if (!sourceRun) throw new ServiceError('Source English Course Run not found', 404);
      if (sourceRun.cohort_id === targetRun.cohort_id) {
        throw new ServiceError('Learner transfer requires a different English class', 400);
      }
      const source = await repository.findRunEnrollmentForUpdate(
        sourceRun.id, input.enrollmentId, client,
      );
      if (!source || source.status !== 'active') {
        throw new ServiceError('English Run Enrollment is not active; reload before transferring', 409);
      }
      if (source.membership_status !== 'active'
        || source.membership_cohort_id !== sourceRun.cohort_id) {
        throw new ServiceError('Active enrollment has no matching active English class membership', 409);
      }
      const membershipStartDate = dateOnly(source.membership_start_date);
      if (membershipStartDate && input.transferDate < membershipStartDate) {
        throw new ServiceError('Transfer date cannot be before the English class membership started', 409);
      }
      if (!source.current_business_unit || !source.current_job_role) {
        throw new ServiceError('Current employee business unit and job role are required for transfer', 409);
      }
      if (await repository.findEnrollmentInRun(targetRun.id, source.employee_id, client)) {
        throw new ServiceError('This learner already has enrollment history in the target Course Run', 409);
      }
      if (await repository.findCurrentMembership(targetRun.cohort_id, source.employee_id, client)) {
        throw new ServiceError('This learner already has an active membership in the target class', 409);
      }
      const targetActiveCount = await repository.countActiveMemberships(targetRun.cohort_id, client);
      const resultingActiveLearnerCount = targetActiveCount + 1;
      const capacityOverrideReason = normalizeLabel(input.capacityOverrideReason);
      const needsCapacityOverride = targetRun.capacity != null
        && resultingActiveLearnerCount > targetRun.capacity;
      if (needsCapacityOverride && !capacityOverrideReason) {
        throw new ServiceError(
          `Target class capacity of ${targetRun.capacity} has been reached; an HR override reason is required`,
          409,
        );
      }

      const targetMembershipId = repository.newId();
      const targetEnrollmentId = repository.newId();
      const transferredEnrollment = await repository.markRunEnrollmentTransferred(source.id, {
        transferDate: input.transferDate,
        targetCourseRunId: targetRun.id,
        targetEnrollmentId,
        authority: AUTHORITY,
      }, client);
      if (!transferredEnrollment) {
        throw new ServiceError('English Run Enrollment changed; reload before transferring', 409);
      }
      const transferredMembership = await repository.markMembershipTransferred(
        source.cohort_membership_id, targetMembershipId, input.transferDate, client,
      );
      if (!transferredMembership) {
        throw new ServiceError('English class membership changed; reload before transferring', 409);
      }
      await repository.createMembership({
        id: targetMembershipId, cohortId: targetRun.cohort_id,
        employeeId: source.employee_id, startDate: input.transferDate,
      }, client);
      const targetEnrollment = await repository.createRunEnrollment({
        id: targetEnrollmentId, courseRunId: targetRun.id,
        employeeId: source.employee_id, membershipId: targetMembershipId,
        startSessionNumber: nextSessionNumber,
        businessUnit: source.current_business_unit,
        jobRole: source.current_job_role,
        transferFromEnrollmentId: source.id,
        meta: { authority: AUTHORITY, createdIn: 'English Operations' },
      }, client);
      let capacityOverrideId = null;
      if (needsCapacityOverride) {
        const actorFields = auditActor(actor);
        if (!actorFields.actorUserId) {
          throw new ServiceError('Capacity override requires an authenticated operator', 403);
        }
        capacityOverrideId = repository.newId();
        await repository.createCapacityOverride({
          id: capacityOverrideId,
          cohortId: targetRun.cohort_id,
          employeeId: source.employee_id,
          courseRunId: targetRun.id,
          previousCapacity: targetRun.capacity,
          resultingActiveLearnerCount,
          reason: capacityOverrideReason,
          actorUserId: actorFields.actorUserId,
        }, client);
        await repository.recordAudit({
          ...actorFields,
          action: 'cohort.capacity.override',
          entityType: 'cohort_capacity_override',
          entityKey: capacityOverrideId,
          details: {
            employeeId: source.employee_id,
            cohortId: targetRun.cohort_id,
            courseRunId: targetRun.id,
            previousCapacity: targetRun.capacity,
            resultingActiveLearnerCount,
            reason: capacityOverrideReason,
            authority: AUTHORITY,
          },
        }, client);
      }
      await repository.recordAudit({
        ...auditActor(actor), action: 'learner.transfer',
        entityType: 'run_enrollment', entityKey: targetEnrollment.id,
        details: {
          employeeId: source.employee_id,
          fromEnrollmentId: source.id, fromCourseRunId: sourceRun.id,
          fromCohortId: sourceRun.cohort_id,
          toCourseRunId: targetRun.id, toCohortId: targetRun.cohort_id,
          fromMembershipId: source.cohort_membership_id,
          membershipId: targetMembershipId,
          transferDate: input.transferDate,
          startSessionNumber: nextSessionNumber,
          capacityOverrideId,
          authority: AUTHORITY,
        },
      }, client);
      return {
        fromEnrollmentId: source.id,
        enrollmentId: targetEnrollment.id,
        fromMembershipId: source.cohort_membership_id,
        membershipId: targetMembershipId,
        startSessionNumber: nextSessionNumber,
        capacityOverrideId,
        capacityOverrideApplied: Boolean(capacityOverrideId),
        capacityOverrideReason: capacityOverrideId ? capacityOverrideReason : null,
        before: { status: source.status, courseRunId: sourceRun.id },
        after: {
          status: targetEnrollment.status,
          courseRunId: targetRun.id,
          capacityOverrideId,
        },
      };
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new ServiceError('Learner transfer conflicts with existing English history', 409);
    }
    throw error;
  }
};

module.exports = {
  createClassCourseRun,
  addRunEnrollment,
  leaveRunEnrollment,
  transferLearner,
};
