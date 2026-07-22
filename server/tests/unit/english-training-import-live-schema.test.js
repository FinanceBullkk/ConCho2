const mockRepo = {
  newId: jest.fn(() => 'raw-1'),
  assertArchiveWritable: jest.fn(),
  withTransaction: jest.fn((work) => work({ tx: true })),
  resetCanonical: jest.fn(),
  insertMany: jest.fn(),
  applyEmployeeCorrections: jest.fn(),
  applySessionTimeCorrections: jest.fn(),
  finalizeImportedMeetings: jest.fn(),
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
    enrollments: [], pics: [], issues: [],
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
    expect(mockRepo.applySessionTimeCorrections.mock.invocationCallOrder[0])
      .toBeLessThan(mockRepo.finalizeImportedMeetings.mock.invocationCallOrder[0]);
  });
});
