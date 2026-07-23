const mockRepo = {
  newId: jest.fn(() => 'raw-1'),
  assertArchiveWritable: jest.fn(),
  withTransaction: jest.fn((work) => work({ tx: true })),
  resetCanonical: jest.fn(),
  insertMany: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  listSessionsForTimeAllocation: jest.fn().mockResolvedValue([{
    id: 'unit-1', naturalKey: 'el001|communication-1|1', classCode: 'EL001',
    courseRunKey: 'el001|communication-1|1', sessionNumber: 1,
    heldAt: '2026-07-20T02:00:00.000Z',
  }]),
  saveSessionTimeAllocation: jest.fn().mockResolvedValue({
    updatedSessions: 1, persistedCorrections: 1,
  }),
  verifySessionTimeAllocation: jest.fn().mockResolvedValue({
    total: 1, mismatches: 0, overlaps: 0, classDateDuplicates: 0,
  }),
  applyEmployeeCorrections: jest.fn(),
  applySessionTimeCorrections: jest.fn(),
  finalizeImportedMeetings: jest.fn(),
  adoptImportedFutureMeetings: jest.fn(),
};

jest.mock('../../domains/english-training/repository.pg', () => mockRepo);
jest.mock('../../domains/english-training/import/read-workbook', () => ({
  IMPORT_SHEETS: [],
  rowHash: jest.fn(),
  readWorkbook: jest.fn().mockResolvedValue({ checksum: 'checksum', sheets: {} }),
}));
jest.mock('../../domains/english-training/import/transform', () => ({
  transform: jest.fn(() => ({
    courses: [], cohorts: [], employees: [], memberships: [], courseRuns: [],
    enrollments: [{
      id: 'enrollment-demoted', course_run_id: 'run-2', employee_id: 'employee-1',
      cohort_membership_id: 'membership-2', status: 'waiting', start_session_number: 1,
      business_unit_id_snapshot: 'BU', job_role_id_snapshot: 'ROLE',
      meta: {
        sourceStatus: 'active',
        canonicalReconciliation: {
          previousStatus: 'active', reason: 'no_attendance_competing_active_enrollment',
          authority: 'authority-hash',
        },
      },
    }], pics: [], issues: [{
      code: 'multi_active_enrollment', sheet: 'ENROLLMENTS', entityType: 'employee',
      entityKey: '1001', status: 'resolved',
      resolutionNote: 'Attendance-evidenced enrollment retained.',
      resolvedBy: 'system:import-canonical-reconciliation',
      resolvedAt: new Date('2026-07-20T00:00:00.000Z'),
    }],
    sessions: [{
      id: 'unit-1', course_run_id: 'run-1', session_number: 1,
      held_at: '2026-07-20T02:00:00.000Z', status: 'held',
      source_sheet: 'CLASS_SESSIONS', source_row: 2, meta: {},
    }],
    attendance: [{
      id: 'attendance-1', session_unit_id: 'unit-1', run_enrollment_id: 'enrollment-1',
      status: 'present', source_sheet: 'ATTENDANCE', source_row: 2, meta: {},
    }],
    reconcile: {},
  })),
}));

const { runImport } = require('../../domains/english-training/import/pipeline');

describe('English import on the live Meeting schema', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stages cancelled Meeting, loads linked unit/fact, then atomically opens final state', async () => {
    await runImport('fixture.xlsx');

    const calls = mockRepo.insertMany.mock.calls;
    const meetingCall = calls.find(([table]) => table === 'eng_meetings');
    const unitCall = calls.find(([table]) => table === 'eng_session_units');
    const attendanceCall = calls.find(([table]) => table === 'eng_attendance_records');

    expect(meetingCall[1][0]).toMatchObject({
      id: 'meeting:unit-1', course_run_id: 'run-1', status: 'cancelled',
      cancellation_reason: 'Import transaction staging',
    });
    expect(unitCall[1][0]).toMatchObject({
      id: 'unit-1', meeting_id: 'meeting:unit-1',
      unit_number_in_meeting: 1, unit_type: 'normal',
    });
    expect(attendanceCall[1][0]).toMatchObject({
      status: 'present', original_status: 'present', entered_by: null,
    });
    expect(calls.indexOf(meetingCall)).toBeLessThan(calls.indexOf(unitCall));
    expect(mockRepo.applySessionTimeCorrections).toHaveBeenCalled();
    expect(mockRepo.finalizeImportedMeetings).toHaveBeenCalled();
    expect(mockRepo.saveSessionTimeAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        assignments: expect.arrayContaining([expect.objectContaining({ id: 'unit-1' })]),
        correctedBy: 'system:eng-import',
      }),
      expect.anything(),
    );
    expect(mockRepo.saveSessionTimeAllocation.mock.invocationCallOrder[0])
      .toBeLessThan(mockRepo.finalizeImportedMeetings.mock.invocationCallOrder[0]);
    expect(mockRepo.finalizeImportedMeetings.mock.invocationCallOrder[0])
      .toBeLessThan(mockRepo.adoptImportedFutureMeetings.mock.invocationCallOrder[0]);

    const issueCall = calls.find(([table]) => table === 'eng_data_quality_issues');
    expect(issueCall[1][0]).toMatchObject({
      status: 'resolved',
      resolution_note: 'Attendance-evidenced enrollment retained.',
      resolved_by: 'system:import-canonical-reconciliation',
      resolved_at: new Date('2026-07-20T00:00:00.000Z'),
    });

    const auditCall = calls.find(([table]) => table === 'eng_audit_events');
    expect(auditCall[1][0]).toMatchObject({
      actor_emp_code: 'SYSTEM', action: 'run_enrollment.reconcile',
      entity_type: 'run_enrollment', entity_key: 'enrollment-demoted',
    });
  });

  test('rejects an unbalanced reconciliation before opening a transaction', async () => {
    const transformModule = require('../../domains/english-training/import/transform');
    const data = transformModule.transform();
    transformModule.transform.mockReturnValueOnce({
      ...data,
      reconcile: { STUDENTS: { source: 2, loaded: 1, ignored: 0 } },
    });

    await expect(runImport('fixture.xlsx')).rejects.toThrow(/reconciliation mismatch.*STUDENTS/i);
    expect(mockRepo.withTransaction).not.toHaveBeenCalled();
  });

  test('reuses persisted time corrections instead of replacing their authority', async () => {
    mockRepo.count.mockResolvedValueOnce(10);

    await runImport('fixture.xlsx', { reset: true });

    expect(mockRepo.applySessionTimeCorrections).toHaveBeenCalled();
    expect(mockRepo.saveSessionTimeAllocation).not.toHaveBeenCalled();
  });
});
