jest.mock('../../domains/schedule/scheduling-window-policy', () => ({
  assertValidBookingWindow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../domains/english-training/canonical-operations-repository.pg', () => ({
  newId: jest.fn(),
  withTransaction: jest.fn(),
  findCourseRunForUpdate: jest.fn(),
  findActiveEmployee: jest.fn(),
  getNextSessionNumber: jest.fn(),
  countActiveRunEnrollments: jest.fn(),
  findActiveEnrollmentForEmployee: jest.fn(),
  findEnrollmentInRun: jest.fn(),
  findCurrentMembership: jest.fn(),
  createMembership: jest.fn(),
  createRunEnrollment: jest.fn(),
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
  addRunEnrollment, createAttendanceSession, getAttendanceRoster,
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
    repository.findActiveEmployee.mockResolvedValue({ id: 'employee-1', full_name: 'Learner One', meta: {} });
    repository.findActiveEnrollmentForEmployee.mockResolvedValue(null);
    repository.findEnrollmentInRun.mockResolvedValue(null);
    repository.countActiveRunEnrollments.mockResolvedValue(4);
    repository.findCurrentMembership.mockResolvedValue(null);
    repository.createMembership.mockResolvedValue({ id: 'membership-1' });
    repository.createRunEnrollment.mockResolvedValue({ id: 'enrollment-1' });
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
    repository.getAttendanceRosterData.mockResolvedValue({ unit, rows: rosterRows });
    const roster = await getAttendanceRoster({ courseRunId: 'run-1', sessionUnitId: 'unit-1' });
    expect(roster.rosterToken).toHaveLength(64);

    await expect(saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: 'b'.repeat(64), records: [],
    }, actor)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/changed/) });

    await expect(saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: rosterToken(unit, rosterRows), records: [],
    }, actor)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/each applicable/) });
    expect(repository.upsertAttendance).not.toHaveBeenCalled();
  });

  test('saves exactly one result per applicable enrollment and completes the Meeting atomically', async () => {
    repository.getAttendanceRosterData.mockResolvedValue({ unit, rows: rosterRows });
    repository.upsertAttendance.mockResolvedValue({ inserted: true });
    const result = await saveAttendanceRoster({
      courseRunId: 'run-1', sessionUnitId: 'unit-1',
      rosterToken: rosterToken(unit, rosterRows),
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
