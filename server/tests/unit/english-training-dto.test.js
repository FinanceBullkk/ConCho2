const dto = require('../../domains/english-training/dto');
const { issueCodeParams } = require('../../domains/english-training/schemas');

describe('English-training data-quality issue DTO', () => {
  test('maps enriched issue detail rows to the camelCase API contract', () => {
    expect(dto.issueDetails([{
      id: 'dq1', issue_code: 'missing_bu', entity_type: 'employee', entity_key: '267040',
      emp_code: '267040', full_name: 'Test Employee', class_code: null,
      business_unit: null, job_role: null,
      source_sheet: 'STUDENTS', source_row: 303, detail: { field: 'BU' },
    }])).toEqual([{
      id: 'dq1', code: 'missing_bu', entityType: 'employee', entityKey: '267040',
      employeeCode: '267040', employeeName: 'Test Employee', classCode: null,
      businessUnit: null, jobRole: null,
      sourceSheet: 'STUDENTS', sourceRow: 303, detail: { field: 'BU' },
    }]);
  });

  test('issue code validation rejects path-like input', () => {
    expect(issueCodeParams.safeParse({ code: '../employees' }).success).toBe(false);
    expect(issueCodeParams.safeParse({ code: 'missing_bu' }).success).toBe(true);
  });
});

describe('English-training Phase-2 DTOs', () => {
  test('maps session attendance and eligibility projections', () => {
    expect(dto.sessionAttendance({
      session: { id: 's1', session_number: 2, held_at: '2026-07-01', status: 'held', course_run_id: 'r1', class_code: 'EL001', course_name: 'Foundation' },
      roster: [{ enrollment_id: 'en1', emp_code: '1001', full_name: 'Alice', enrollment_status: 'active', attendance_status: null, source_enrollment_dropped: false }],
    })).toEqual(expect.objectContaining({
      id: 's1', sessionNumber: 2,
      roster: [expect.objectContaining({ employeeCode: '1001', attendanceStatus: 'unmarked' })],
    }));

    expect(dto.eligibilityList([{
      enrollment_id: 'en1', emp_code: '1001', full_name: 'Alice', enrollment_status: 'completed',
      course_run_id: 'r1', run_status: 'completed', class_code: 'EL001', course_name: 'Foundation',
      allowed_absences: 2, marked_sessions: 10, present_count: 8, absence_count: 2,
      eligibility_status: 'eligible',
    }])[0]).toEqual(expect.objectContaining({ absenceCount: 2, eligibilityStatus: 'eligible' }));
  });
});
