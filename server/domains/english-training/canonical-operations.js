const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./canonical-operations-repository.pg');

const AUTHORITY = 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9';

const normalizeLabel = (value) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || null;
};

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

      const auditBase = {
        actorUserId: actor._id || actor.id || null,
        actorEmpCode: actor.empCode || null,
      };
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

module.exports = { createClassCourseRun, normalizeLabel };
