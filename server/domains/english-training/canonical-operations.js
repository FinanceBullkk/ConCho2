const crypto = require('crypto');
const { ServiceError } = require('../../helpers/ServiceError');
const { assertValidBookingWindow } = require('../schedule/scheduling-window-policy');
const repository = require('./canonical-operations-repository.pg');
const meetingDelivery = require('./meeting-delivery');

const AUTHORITY = 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9';

const normalizeLabel = (value) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || null;
};

const auditActor = (actor = {}) => ({
  actorUserId: actor._id || actor.id || null,
  actorEmpCode: actor.empCode || null,
});

const iso = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const meetingWindow = async (startsAtValue, endsAtValue) => {
  const startsAt = new Date(startsAtValue);
  const endsAt = new Date(endsAtValue);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new ServiceError('Session start and end must be valid timezone-aware dates', 400);
  }
  if (startsAt <= new Date()) {
    throw new ServiceError('English sessions must be scheduled in the future', 409);
  }
  await assertValidBookingWindow(startsAt, endsAt);
  return {
    startsAt,
    endsAt,
    durationMinutes: Math.round((endsAt.getTime() - startsAt.getTime()) / 60000),
  };
};

const rosterToken = (unit, rows) => crypto.createHash('sha256').update(JSON.stringify({
  meetingId: unit.meeting_id,
  meetingStatus: unit.meeting_status,
  startsAt: iso(unit.starts_at),
  rows: rows.map((row) => [row.run_enrollment_id, row.attendance_id, row.recorded_status]),
})).digest('hex');

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

const createAttendanceSession = async (input, actor = {}) => {
  const { startsAt, endsAt, durationMinutes } = await meetingWindow(input.startsAt, input.endsAt);

  try {
    const result = await repository.withTransaction(async (client) => {
      const run = await repository.findCourseRunForUpdate(input.courseRunId, client);
      if (!run) throw new ServiceError('English Course Run not found', 404);
      if (!['planned', 'active'].includes(run.status)) {
        throw new ServiceError('Sessions require a planned or active English Course Run', 409);
      }
      const nextSessionNumber = await repository.getNextSessionNumber(run.id, client);
      if (Number(input.confirmedSessionNumber) !== nextSessionNumber) {
        throw new ServiceError('Next session number changed; reload the schedule before saving', 409);
      }
      const meeting = await repository.createMeeting({
        id: repository.newId(), courseRunId: run.id,
        startsAt: startsAt.toISOString(), durationMinutes,
        meta: { authority: AUTHORITY, createdIn: 'English Operations', endsAt: endsAt.toISOString() },
      }, client);
      const unit = await repository.createSessionUnit({
        id: repository.newId(), courseRunId: run.id, meetingId: meeting.id,
        sessionNumber: nextSessionNumber, startsAt: startsAt.toISOString(),
        meta: { authority: AUTHORITY, meetingId: meeting.id, endsAt: endsAt.toISOString() },
      }, client);
      await repository.recordAudit({
        ...auditActor(actor), action: 'attendance.session.create',
        entityType: 'session_unit', entityKey: unit.id,
        details: {
          courseRunId: run.id, meetingId: meeting.id,
          sessionNumber: nextSessionNumber, startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(), authority: AUTHORITY,
        },
      }, client);
      return { meetingId: meeting.id, sessionUnitId: unit.id, sessionNumber: nextSessionNumber };
    });
    await meetingDelivery.notifyMeetingCreated(result.meetingId);
    return result;
  } catch (error) {
    if (error.code === '23505') throw new ServiceError('That English teaching slot is already occupied', 409);
    throw error;
  }
};

const rescheduleMeeting = async (input, actor = {}) => {
  const { startsAt, endsAt, durationMinutes } = await meetingWindow(input.startsAt, input.endsAt);
  try {
    const result = await repository.withTransaction(async (client) => {
      const meeting = await repository.findMeetingForUpdate(
        input.courseRunId, input.meetingId, client,
      );
      if (!meeting) throw new ServiceError('English Meeting not found in the selected Course Run', 404);
      if (meeting.source_sheet !== null) {
        throw new ServiceError('Imported English schedule evidence is read-only', 409);
      }
      if (meeting.status !== 'planned') {
        throw new ServiceError('Only a planned English Meeting can be rescheduled', 409);
      }
      if (new Date(meeting.starts_at) <= new Date()) {
        throw new ServiceError('A Meeting that has already started cannot be rescheduled', 409);
      }
      if (Number(meeting.attendance_count) > 0) {
        throw new ServiceError('A Meeting with attendance evidence cannot be rescheduled', 409);
      }

      const updated = await repository.rescheduleMeeting(input.meetingId, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        durationMinutes,
        reason: input.reason,
      }, client);
      if (!updated) throw new ServiceError('English Meeting changed; reload before saving', 409);
      await repository.recordAudit({
        ...auditActor(actor), action: 'meeting.reschedule',
        entityType: 'meeting', entityKey: input.meetingId,
        details: {
          courseRunId: input.courseRunId,
          sessionUnitId: meeting.session_unit_id,
          sessionNumber: meeting.session_number,
          before: { startsAt: iso(meeting.starts_at), durationMinutes: meeting.duration_minutes },
          after: { startsAt: startsAt.toISOString(), durationMinutes },
          reason: input.reason || null,
          authority: AUTHORITY,
        },
      }, client);
      return {
        meetingId: input.meetingId,
        sessionUnitId: meeting.session_unit_id,
        sessionNumber: meeting.session_number,
        before: {
          startsAt: iso(meeting.starts_at),
          endsAt: new Date(
            new Date(meeting.starts_at).getTime() + Number(meeting.duration_minutes) * 60000,
          ).toISOString(),
          status: meeting.status,
        },
        after: {
          startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), status: updated.status,
        },
      };
    });
    await meetingDelivery.notifyMeetingRescheduled(
      result.meetingId, result.before.startsAt, input.reason,
    );
    return result;
  } catch (error) {
    if (error.code === '23505') throw new ServiceError('That English teaching slot is already occupied', 409);
    throw error;
  }
};

const cancelMeeting = async (input, actor = {}) => {
  const result = await repository.withTransaction(async (client) => {
    const meeting = await repository.findMeetingForUpdate(
      input.courseRunId, input.meetingId, client,
    );
    if (!meeting) throw new ServiceError('English Meeting not found in the selected Course Run', 404);
    if (meeting.source_sheet !== null) {
      throw new ServiceError('Imported English schedule evidence is read-only', 409);
    }
    if (meeting.status === 'cancelled') {
      throw new ServiceError('This English Meeting is already cancelled', 409);
    }
    if (meeting.status !== 'planned' || new Date(meeting.starts_at) <= new Date()) {
      throw new ServiceError('A Meeting that has started or completed cannot be cancelled', 409);
    }
    if (Number(meeting.attendance_count) > 0) {
      throw new ServiceError('A Meeting with attendance evidence cannot be cancelled', 409);
    }
    const cancelled = await repository.cancelMeeting(
      input.meetingId, input.cancellationReason, client,
    );
    if (!cancelled) throw new ServiceError('English Meeting changed; reload before cancelling', 409);
    await repository.recordAudit({
      ...auditActor(actor), action: 'meeting.cancel',
      entityType: 'meeting', entityKey: input.meetingId,
      details: {
        courseRunId: input.courseRunId,
        sessionUnitId: meeting.session_unit_id,
        sessionNumber: meeting.session_number,
        beforeStatus: meeting.status,
        afterStatus: cancelled.status,
        cancellationReason: input.cancellationReason,
        authority: AUTHORITY,
      },
    }, client);
    return {
      meetingId: input.meetingId,
      sessionUnitId: meeting.session_unit_id,
      sessionNumber: meeting.session_number,
      before: { status: meeting.status, startsAt: iso(meeting.starts_at) },
      after: {
        status: cancelled.status,
        startsAt: iso(cancelled.starts_at),
        cancellationReason: cancelled.cancellation_reason,
      },
    };
  });
  await meetingDelivery.notifyMeetingCancelled(
    result.meetingId, actor.name || actor.empCode || 'English Operations',
  );
  return result;
};

const getAttendanceRoster = async ({ courseRunId, sessionUnitId }) => repository.withTransaction(async (client) => {
  const data = await repository.getAttendanceRosterData(courseRunId, sessionUnitId, client);
  if (!data) throw new ServiceError('English Session Unit not found in the selected Course Run', 404);
  if (data.unit.meeting_status === 'cancelled') {
    throw new ServiceError('Cancelled English Meetings do not have an attendance roster', 409);
  }
  if (data.unit.unit_type === 'makeup') {
    throw new ServiceError('Make-up Session Units use the linked absence workflow', 409);
  }
  return {
    courseRunId,
    sessionUnitId,
    sessionNumber: data.unit.session_number,
    meetingId: data.unit.meeting_id,
    meetingStatus: data.unit.meeting_status,
    startsAt: data.unit.starts_at,
    durationMinutes: data.unit.duration_minutes,
    rosterToken: rosterToken(data.unit, data.rows),
    rows: data.rows.map((row) => ({
      runEnrollmentId: row.run_enrollment_id,
      empCode: row.emp_code,
      fullName: row.full_name,
      startSessionNumber: row.start_session_number,
      status: row.effective_status,
      attendanceId: row.attendance_id || null,
    })),
  };
});

const saveAttendanceRoster = async (input, actor = {}) => repository.withTransaction(async (client) => {
  const run = await repository.findCourseRunForUpdate(input.courseRunId, client);
  if (!run) throw new ServiceError('English Course Run not found', 404);
  const data = await repository.getAttendanceRosterData(
    input.courseRunId, input.sessionUnitId, client, { lock: true },
  );
  if (!data) throw new ServiceError('English Session Unit not found in the selected Course Run', 404);
  if (data.unit.meeting_status === 'cancelled') {
    throw new ServiceError('Cancelled English Meetings cannot receive attendance', 409);
  }
  if (data.unit.unit_type === 'makeup') {
    throw new ServiceError('Make-up Session Units use the linked absence workflow', 409);
  }
  if (input.rosterToken !== rosterToken(data.unit, data.rows)) {
    throw new ServiceError('Attendance roster changed; reload it before saving', 409);
  }

  const rosterIds = new Set(data.rows.map((row) => row.run_enrollment_id));
  const submittedIds = input.records.map((row) => row.runEnrollmentId);
  if (submittedIds.length !== new Set(submittedIds).size
    || submittedIds.length !== rosterIds.size
    || submittedIds.some((id) => !rosterIds.has(id))) {
    throw new ServiceError('Attendance save must include each applicable learner exactly once', 409);
  }

  const before = new Map(data.rows.map((row) => [row.run_enrollment_id, row.recorded_status]));
  let createdCount = 0;
  let updatedCount = 0;
  const changes = [];
  for (const record of input.records) {
    // Sequential writes keep audit ordering deterministic and remain one transaction.
    // eslint-disable-next-line no-await-in-loop
    const saved = await repository.upsertAttendance({
      id: repository.newId(), sessionUnitId: input.sessionUnitId,
      runEnrollmentId: record.runEnrollmentId, status: record.status,
      enteredBy: actor._id || actor.id || null,
      meta: { authority: AUTHORITY, source: 'English Operations' },
    }, client);
    if (saved.inserted) createdCount += 1;
    else if (before.get(record.runEnrollmentId) !== record.status) updatedCount += 1;
    if (before.get(record.runEnrollmentId) !== record.status) {
      changes.push({
        runEnrollmentId: record.runEnrollmentId,
        before: before.get(record.runEnrollmentId) || null,
        after: record.status,
      });
    }
  }
  await repository.completeMeeting(data.unit.meeting_id, client);
  await repository.recordAudit({
    ...auditActor(actor), action: 'attendance.roster.save',
    entityType: 'session_unit', entityKey: input.sessionUnitId,
    details: {
      courseRunId: input.courseRunId, meetingId: data.unit.meeting_id,
      rosterCount: input.records.length, createdCount, updatedCount,
      unchangedCount: input.records.length - changes.length,
      meetingStatusBefore: data.unit.meeting_status, meetingStatusAfter: 'completed',
      changes, authority: AUTHORITY,
    },
  }, client);
  return {
    sessionUnitId: input.sessionUnitId, count: input.records.length,
    createdCount, updatedCount, unchangedCount: input.records.length - changes.length,
  };
});

module.exports = {
  createClassCourseRun,
  addRunEnrollment,
  createAttendanceSession,
  rescheduleMeeting,
  cancelMeeting,
  getAttendanceRoster,
  saveAttendanceRoster,
  normalizeLabel,
  rosterToken,
};
