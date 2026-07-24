jest.mock('../../domains/schedule/scheduling-window-policy', () => ({
  assertValidBookingWindow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../domains/english-training/canonical-operations-repository.pg', () => ({
  newId: jest.fn(),
  withTransaction: jest.fn(),
  findCourseRunForUpdate: jest.fn(),
  findActiveEmployee: jest.fn(),
  getNextSessionNumber: jest.fn(),
  getTransferStartSessionNumber: jest.fn(),
  countActiveRunEnrollments: jest.fn(),
  countActiveMemberships: jest.fn(),
  findActiveEnrollmentForEmployee: jest.fn(),
  findEnrollmentInRun: jest.fn(),
  findRunEnrollmentForUpdate: jest.fn(),
  findCurrentMembership: jest.fn(),
  createMembership: jest.fn(),
  createRunEnrollment: jest.fn(),
  markRunEnrollmentTransferred: jest.fn(),
  markMembershipTransferred: jest.fn(),
  createCapacityOverride: jest.fn(),
  dropRunEnrollment: jest.fn(),
  endMembershipIfUnused: jest.fn(),
  createMeeting: jest.fn(),
  createSessionUnit: jest.fn(),
  findMeetingForUpdate: jest.fn(),
  rescheduleMeeting: jest.fn(),
  cancelMeeting: jest.fn(),
  getAttendanceRosterData: jest.fn(),
  upsertAttendance: jest.fn(),
  completeMeeting: jest.fn(),
  recordAudit: jest.fn(),
}));

jest.mock('../../domains/english-training/meeting-delivery', () => ({
  notifyMeetingCreated: jest.fn().mockResolvedValue(undefined),
  notifyMeetingRescheduled: jest.fn().mockResolvedValue(undefined),
  notifyMeetingCancelled: jest.fn().mockResolvedValue(undefined),
}));

const policy = require('../../domains/schedule/scheduling-window-policy');
const repository = require('../../domains/english-training/canonical-operations-repository.pg');
const delivery = require('../../domains/english-training/meeting-delivery');
const {
  addRunEnrollment, leaveRunEnrollment, transferLearner,
  createAttendanceSession, getAttendanceRoster,
  rescheduleMeeting, cancelMeeting, saveAttendanceRoster, rosterToken,
} = require('../../domains/english-training/canonical-operations');

const actor = { _id: 'actor-1', empCode: 'A001' };
const run = {
  id: 'run-1', cohort_id: 'cohort-1', status: 'active', capacity: 12,
  class_code: 'EL001', course_name: 'Foundation',
};
const unit = {
  id: 'unit-1', meeting_id: 'meeting-1', meeting_status: 'planned',
  starts_at: new Date('2099-07-20T02:00:00.000Z'), duration_minutes: 60,
  session_number: 3, unit_type: 'normal',
};
// Same unit after its session has started — attendance records what happened, so
// the roster-save tests use this while reschedule/cancel keep the future `unit`.
const startedUnit = { ...unit, starts_at: new Date('2020-01-06T02:00:00.000Z') };
const rosterRows = [{
  run_enrollment_id: 'enrollment-1', attendance_id: null, recorded_status: null,
  effective_status: 'present', emp_code: 'E001', full_name: 'Learner One',
  start_session_number: 1,
}];

describe('canonical English live operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    policy.assertValidBookingWindow.mockResolvedValue(undefined);
    repository.withTransaction.mockImplementation((work) => work({ query: jest.fn() }));
    repository.findCourseRunForUpdate.mockResolvedValue(run);
    repository.getNextSessionNumber.mockResolvedValue(3);
    repository.getTransferStartSessionNumber.mockResolvedValue(3);
    repository.findActiveEmployee.mockResolvedValue({ id: 'employee-1', full_name: 'Learner One', meta: {} });
    repository.findActiveEnrollmentForEmployee.mockResolvedValue(null);
    repository.findEnrollmentInRun.mockResolvedValue(null);
    repository.countActiveRunEnrollments.mockResolvedValue(4);
    repository.countActiveMemberships.mockResolvedValue(4);
    repository.findCurrentMembership.mockResolvedValue(null);
    repository.createMembership.mockResolvedValue({ id: 'membership-1' });
    repository.createRunEnrollment.mockResolvedValue({ id: 'enrollment-1' });
    repository.findRunEnrollmentForUpdate.mockResolvedValue({
      id: 'enrollment-1', course_run_id: 'run-1', employee_id: 'employee-1',
      cohort_membership_id: 'membership-1', status: 'active',
      membership_status: 'active', membership_cohort_id: 'cohort-1',
      membership_start_date: '2026-07-01',
    });
    repository.dropRunEnrollment.mockResolvedValue({ id: 'enrollment-1', status: 'dropped' });
    repository.endMembershipIfUnused.mockResolvedValue({
      id: 'membership-1', status: 'cancelled', end_date: '2026-07-20',
    });
    repository.markRunEnrollmentTransferred.mockResolvedValue({
      id: 'enrollment-1', status: 'transferred',
    });
    repository.markMembershipTransferred.mockResolvedValue({
      id: 'membership-1', status: 'transferred',
    });
    repository.createCapacityOverride.mockResolvedValue({ id: 'override-1' });
  });

  test('starts a learner at the confirmed next logical session in one transaction', async () => {
    repository.newId.mockReturnValueOnce('membership-1').mockReturnValueOnce('enrollment-1');
    const result = await addRunEnrollment({
      courseRunId: 'run-1', employeeId: 'employee-1',
      startDate: '2026-07-20', confirmedStartSessionNumber: 3,
    }, actor);
    expect(result).toMatchObject({ enrollmentId: 'enrollment-1', startSessionNumber: 3 });
    expect(repository.createRunEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      startSessionNumber: 3, membershipId: 'membership-1',
    }), expect.anything());
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'run_enrollment.start',
    }), expect.anything());
  });

  test('rejects a stale learner start proposal without creating membership or enrollment', async () => {
    await expect(addRunEnrollment({
      courseRunId: 'run-1', employeeId: 'employee-1',
      startDate: '2026-07-20', confirmedStartSessionNumber: 2,
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.createMembership).not.toHaveBeenCalled();
    expect(repository.createRunEnrollment).not.toHaveBeenCalled();
  });

  test('marks an active learner as left and ends the unused membership atomically', async () => {
    const result = await leaveRunEnrollment({
      courseRunId: 'run-1', enrollmentId: 'enrollment-1',
      lastActiveDate: '2026-07-20', reason: 'Work schedule changed',
    }, actor);

    expect(result).toEqual({
      enrollmentId: 'enrollment-1', membershipId: 'membership-1',
      before: { status: 'active' },
      after: { status: 'dropped', lastActiveDate: '2026-07-20' },
      membershipEnded: true,
    });
    expect(repository.dropRunEnrollment).toHaveBeenCalledWith(
      'enrollment-1', expect.objectContaining({
        lastActiveDate: '2026-07-20', reason: 'Work schedule changed',
      }), expect.anything(),
    );
    expect(repository.endMembershipIfUnused).toHaveBeenCalledWith(
      'membership-1', '2026-07-20', expect.anything(),
    );
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'run_enrollment.leave',
      details: expect.objectContaining({ reason: 'Work schedule changed' }),
    }), expect.anything());
  });

  test('rejects a learner leave date before membership started without changing history', async () => {
    repository.findRunEnrollmentForUpdate.mockResolvedValue({
      id: 'enrollment-1', course_run_id: 'run-1', employee_id: 'employee-1',
      cohort_membership_id: 'membership-1', status: 'active',
      membership_status: 'active',
      // PostgreSQL DATE values are parsed as Vietnam midnight in this app.
      membership_start_date: new Date('2026-07-19T17:00:00.000Z'),
    });
    await expect(leaveRunEnrollment({
      courseRunId: 'run-1', enrollmentId: 'enrollment-1',
      lastActiveDate: '2026-07-19', reason: 'Incorrect class assignment',
    }, actor)).rejects.toMatchObject({ statusCode: 409 });

    expect(repository.dropRunEnrollment).not.toHaveBeenCalled();
    expect(repository.endMembershipIfUnused).not.toHaveBeenCalled();
  });

  test('transfers one active learner to a different class and links both histories', async () => {
    const target = { ...run, id: 'run-2', cohort_id: 'cohort-2', class_code: 'EL002' };
    repository.findCourseRunForUpdate.mockImplementation(async (id) => (
      id === 'run-2' ? target : run
    ));
    repository.findRunEnrollmentForUpdate.mockResolvedValue({
      id: 'enrollment-1', course_run_id: 'run-1', employee_id: 'employee-1',
      cohort_membership_id: 'membership-1', status: 'active',
      membership_status: 'active', membership_cohort_id: 'cohort-1',
      membership_start_date: '2026-07-01',
      current_business_unit: 'Finance', current_job_role: 'Analyst',
    });
    repository.newId.mockReturnValueOnce('membership-2').mockReturnValueOnce('enrollment-2');
    repository.createMembership.mockResolvedValue({ id: 'membership-2' });
    repository.createRunEnrollment.mockResolvedValue({ id: 'enrollment-2', status: 'active' });

    await expect(transferLearner({
      sourceCourseRunId: 'run-1', enrollmentId: 'enrollment-1',
      targetCourseRunId: 'run-2', transferDate: '2026-07-20',
      confirmedStartSessionNumber: 3,
    }, actor)).resolves.toMatchObject({
      fromEnrollmentId: 'enrollment-1', enrollmentId: 'enrollment-2',
      membershipId: 'membership-2', startSessionNumber: 3,
    });
    expect(repository.markMembershipTransferred).toHaveBeenCalledWith(
      'membership-1', 'membership-2', '2026-07-20', expect.anything(),
    );
    expect(repository.createRunEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      id: 'enrollment-2', transferFromEnrollmentId: 'enrollment-1',
      businessUnit: 'Finance', jobRole: 'Analyst',
    }), expect.anything());
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'learner.transfer', entityKey: 'enrollment-2',
    }), expect.anything());
  });

  test('rejects a stale transfer proposal before closing source history', async () => {
    repository.findCourseRunForUpdate.mockImplementation(async (id) => (
      id === 'run-2' ? { ...run, id: 'run-2', cohort_id: 'cohort-2' } : run
    ));
    await expect(transferLearner({
      sourceCourseRunId: 'run-1', enrollmentId: 'enrollment-1',
      targetCourseRunId: 'run-2', transferDate: '2026-07-20',
      confirmedStartSessionNumber: 2,
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.markRunEnrollmentTransferred).not.toHaveBeenCalled();
    expect(repository.markMembershipTransferred).not.toHaveBeenCalled();
    expect(repository.createRunEnrollment).not.toHaveBeenCalled();
  });

  test('rejects a transfer into a full class without a partial source close', async () => {
    repository.findCourseRunForUpdate.mockImplementation(async (id) => (
      id === 'run-2' ? { ...run, id: 'run-2', cohort_id: 'cohort-2', capacity: 4 } : run
    ));
    repository.findRunEnrollmentForUpdate.mockResolvedValue({
      id: 'enrollment-1', employee_id: 'employee-1',
      cohort_membership_id: 'membership-1', status: 'active',
      membership_status: 'active', membership_cohort_id: 'cohort-1',
      membership_start_date: '2026-07-01',
      current_business_unit: 'Finance', current_job_role: 'Analyst',
    });
    repository.countActiveMemberships.mockResolvedValue(4);

    await expect(transferLearner({
      sourceCourseRunId: 'run-1', enrollmentId: 'enrollment-1',
      targetCourseRunId: 'run-2', transferDate: '2026-07-20',
      confirmedStartSessionNumber: 3,
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.markRunEnrollmentTransferred).not.toHaveBeenCalled();
    expect(repository.markMembershipTransferred).not.toHaveBeenCalled();
  });

  test('records a reasoned capacity override inside the learner transfer transaction', async () => {
    repository.findCourseRunForUpdate.mockImplementation(async (id) => (
      id === 'run-2' ? { ...run, id: 'run-2', cohort_id: 'cohort-2', capacity: 4 } : run
    ));
    repository.findRunEnrollmentForUpdate.mockResolvedValue({
      id: 'enrollment-1', employee_id: 'employee-1',
      cohort_membership_id: 'membership-1', status: 'active',
      membership_status: 'active', membership_cohort_id: 'cohort-1',
      membership_start_date: '2026-07-01',
      current_business_unit: 'Finance', current_job_role: 'Analyst',
    });
    repository.countActiveMemberships.mockResolvedValue(4);
    repository.newId
      .mockReturnValueOnce('membership-2')
      .mockReturnValueOnce('enrollment-2')
      .mockReturnValueOnce('override-1');
    repository.createMembership.mockResolvedValue({ id: 'membership-2' });
    repository.createRunEnrollment.mockResolvedValue({ id: 'enrollment-2', status: 'active' });

    await expect(transferLearner({
      sourceCourseRunId: 'run-1', enrollmentId: 'enrollment-1',
      targetCourseRunId: 'run-2', transferDate: '2026-07-20',
      confirmedStartSessionNumber: 3,
      capacityOverrideReason: '  HR approved   an additional seat  ',
    }, actor)).resolves.toMatchObject({
      enrollmentId: 'enrollment-2', capacityOverrideApplied: true,
      capacityOverrideId: 'override-1',
    });
    expect(repository.createCapacityOverride).toHaveBeenCalledWith({
      id: 'override-1', cohortId: 'cohort-2', employeeId: 'employee-1',
      courseRunId: 'run-2', previousCapacity: 4,
      resultingActiveLearnerCount: 5,
      reason: 'HR approved an additional seat', actorUserId: 'actor-1',
    }, expect.anything());
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'cohort.capacity.override', entityKey: 'override-1',
      details: expect.objectContaining({
        previousCapacity: 4, resultingActiveLearnerCount: 5,
        reason: 'HR approved an additional seat',
      }),
    }), expect.anything());
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'learner.transfer',
      details: expect.objectContaining({ capacityOverrideId: 'override-1' }),
    }), expect.anything());
  });

  test('creates a Meeting and Session Unit only after slot and sequence validation', async () => {
    repository.newId.mockReturnValueOnce('meeting-1').mockReturnValueOnce('unit-1');
    repository.createMeeting.mockResolvedValue({ id: 'meeting-1' });
    repository.createSessionUnit.mockResolvedValue({ id: 'unit-1' });
    const result = await createAttendanceSession({
      courseRunId: 'run-1', startsAt: '2099-07-20T02:00:00.000Z',
      endsAt: '2099-07-20T03:00:00.000Z', confirmedSessionNumber: 3,
    }, actor);
    expect(policy.assertValidBookingWindow).toHaveBeenCalled();
    expect(result).toEqual({ meetingId: 'meeting-1', sessionUnitId: 'unit-1', sessionNumber: 3 });
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'attendance.session.create',
    }), expect.anything());
    expect(delivery.notifyMeetingCreated).toHaveBeenCalledWith('meeting-1');
  });

  test('reschedules a future live Meeting without changing its Session Unit identity', async () => {
    repository.findMeetingForUpdate.mockResolvedValue({
      ...unit, course_run_id: 'run-1', source_sheet: null, status: 'planned',
      session_unit_id: 'unit-1', attendance_count: 0,
    });
    repository.rescheduleMeeting.mockResolvedValue({
      id: 'meeting-1', status: 'planned', starts_at: new Date('2099-07-21T02:00:00.000Z'),
    });
    const result = await rescheduleMeeting({
      courseRunId: 'run-1', meetingId: 'meeting-1',
      startsAt: '2099-07-21T02:00:00.000Z', endsAt: '2099-07-21T03:00:00.000Z',
      reason: 'PIC requested another day',
    }, actor);
    expect(result).toMatchObject({ meetingId: 'meeting-1', sessionUnitId: 'unit-1', sessionNumber: 3 });
    expect(repository.rescheduleMeeting).toHaveBeenCalledWith('meeting-1', expect.objectContaining({
      startsAt: '2099-07-21T02:00:00.000Z',
    }), expect.anything());
    expect(delivery.notifyMeetingRescheduled).toHaveBeenCalledWith(
      'meeting-1', expect.any(String), 'PIC requested another day',
    );
  });

  test('reschedules an adopted future imported Meeting while preserving its source identity', async () => {
    repository.findMeetingForUpdate.mockResolvedValue({
      ...unit,
      course_run_id: 'run-1',
      source_sheet: 'English schedule',
      operational_at: new Date('2099-07-01T00:00:00.000Z'),
      source_starts_at: new Date('2099-07-20T02:00:00.000Z'),
      status: 'planned',
      session_unit_id: 'unit-1',
      attendance_count: 0,
    });
    repository.rescheduleMeeting.mockResolvedValue({
      id: 'meeting-1', status: 'planned', starts_at: new Date('2099-07-21T02:00:00.000Z'),
    });

    await expect(rescheduleMeeting({
      courseRunId: 'run-1', meetingId: 'meeting-1',
      startsAt: '2099-07-21T02:00:00.000Z', endsAt: '2099-07-21T03:00:00.000Z',
      reason: 'PIC requested another day',
    }, actor)).resolves.toMatchObject({ meetingId: 'meeting-1', sessionUnitId: 'unit-1' });

    expect(repository.rescheduleMeeting).toHaveBeenCalled();
  });

  test('durably cancels a future live Meeting and preserves its history', async () => {
    repository.findMeetingForUpdate.mockResolvedValue({
      ...unit, course_run_id: 'run-1', source_sheet: null, status: 'planned',
      session_unit_id: 'unit-1', attendance_count: 0,
    });
    repository.cancelMeeting.mockResolvedValue({
      id: 'meeting-1', status: 'cancelled', starts_at: unit.starts_at,
      cancellation_reason: 'Company event',
    });
    const result = await cancelMeeting({
      courseRunId: 'run-1', meetingId: 'meeting-1', cancellationReason: 'Company event',
    }, actor);
    expect(result.after).toMatchObject({ status: 'cancelled', cancellationReason: 'Company event' });
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'meeting.cancel',
    }), expect.anything());
    expect(delivery.notifyMeetingCancelled).toHaveBeenCalledWith('meeting-1', 'A001');
  });

  test('keeps imported or attendance-bearing Meetings read-only', async () => {
    repository.findMeetingForUpdate.mockResolvedValue({
      ...unit, source_sheet: 'Historical', operational_at: null, status: 'planned',
      session_unit_id: 'unit-1', attendance_count: 1,
    });
    await expect(cancelMeeting({
      courseRunId: 'run-1', meetingId: 'meeting-1', cancellationReason: 'Invalid source',
    }, actor)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/read-only/) });
    expect(repository.cancelMeeting).not.toHaveBeenCalled();
  });

  test('returns an opaque token and rejects stale or incomplete full-roster saves', async () => {
    repository.getAttendanceRosterData.mockResolvedValue({ unit: startedUnit, rows: rosterRows });
    const roster = await getAttendanceRoster({ courseRunId: 'run-1', sessionUnitId: 'unit-1' });
    expect(roster.rosterToken).toHaveLength(64);

    await expect(saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: 'b'.repeat(64), records: [],
    }, actor)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/changed/) });

    await expect(saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: rosterToken(startedUnit, rosterRows), records: [],
    }, actor)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/each applicable/) });
    expect(repository.upsertAttendance).not.toHaveBeenCalled();
  });

  test('refuses to record attendance before the session has started', async () => {
    const futureUnit = { ...unit, starts_at: new Date('2099-07-20T02:00:00.000Z') };
    repository.getAttendanceRosterData.mockResolvedValue({ unit: futureUnit, rows: rosterRows });
    await expect(saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: rosterToken(futureUnit, rosterRows),
      records: [{ runEnrollmentId: 'enrollment-1', status: 'present' }],
    }, actor)).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/has not started/i) });
    expect(repository.upsertAttendance).not.toHaveBeenCalled();
  });

  test('saves exactly one result per applicable enrollment and completes the Meeting atomically', async () => {
    repository.getAttendanceRosterData.mockResolvedValue({ unit: startedUnit, rows: rosterRows });
    repository.upsertAttendance.mockResolvedValue({ inserted: true });
    const result = await saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: rosterToken(startedUnit, rosterRows),
      records: [{ runEnrollmentId: 'enrollment-1', status: 'present' }],
    }, actor);
    expect(result).toEqual({
      sessionUnitId: 'unit-1', count: 1, createdCount: 1,
      updatedCount: 0, unchangedCount: 0,
    });
    expect(repository.completeMeeting).toHaveBeenCalledWith('meeting-1', expect.anything());
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'attendance.roster.save',
    }), expect.anything());
  });
});
