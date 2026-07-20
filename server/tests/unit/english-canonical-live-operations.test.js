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
  getAttendanceRosterData: jest.fn(),
  upsertAttendance: jest.fn(),
  completeMeeting: jest.fn(),
  recordAudit: jest.fn(),
}));

const policy = require('../../domains/schedule/scheduling-window-policy');
const repository = require('../../domains/english-training/canonical-operations-repository.pg');
const {
  addRunEnrollment, createAttendanceSession, getAttendanceRoster,
  saveAttendanceRoster, rosterToken,
} = require('../../domains/english-training/canonical-operations');

const actor = { _id: 'actor-1', empCode: 'A001' };
const run = {
  id: 'run-1', cohort_id: 'cohort-1', status: 'active', capacity: 12,
  class_code: 'EL001', course_name: 'Foundation',
};
const unit = {
  id: 'unit-1', meeting_id: 'meeting-1', meeting_status: 'planned',
  starts_at: new Date('2026-07-20T02:00:00.000Z'), duration_minutes: 60,
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
      courseRunId: 'run-1', startsAt: '2026-07-20T02:00:00.000Z',
      endsAt: '2026-07-20T03:00:00.000Z', confirmedSessionNumber: 3,
    }, actor);
    expect(policy.assertValidBookingWindow).toHaveBeenCalled();
    expect(result).toEqual({ meetingId: 'meeting-1', sessionUnitId: 'unit-1', sessionNumber: 3 });
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'attendance.session.create',
    }), expect.anything());
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
