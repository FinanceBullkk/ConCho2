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

describe('English-training class-detail 360° DTO', () => {
  test('groups the flat roster onto its course run and maps the camelCase contract', () => {
    const result = dto.classDetail({
      cohort: { id: 'co1', class_code: 'EL001', display_name: 'Alpha', status: 'active' },
      runs: [
        { id: 'r1', run_number: 1, status: 'completed', course_code: 'FND', course_name: 'Foundation', start_date: '2026-01-01', end_date: '2026-03-01', max_absences_allowed: 2 },
        { id: 'r2', run_number: 1, status: 'active', course_code: 'INT', course_name: 'Intermediate', start_date: null, end_date: null, max_absences_allowed: 3 },
      ],
      roster: [
        { enrollment_id: 'en1', course_run_id: 'r1', enrollment_status: 'completed', emp_code: '1001', full_name: 'Alice', allowed_absences: 2, present_count: 8, absence_count: 1, exam_level_code: 'A2', exam_level_name: 'A2 Elementary', exam_date: '2026-03-05', eligibility_status: 'eligible' },
        { enrollment_id: 'en2', course_run_id: 'r1', enrollment_status: 'active', emp_code: '1002', full_name: 'Bob', allowed_absences: 2, present_count: 4, absence_count: 3, exam_level_code: null, exam_level_name: null, exam_date: null, eligibility_status: 'not_eligible' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ id: 'co1', classCode: 'EL001', displayName: 'Alpha', status: 'active' }));
    expect(result.runs).toHaveLength(2);
    expect(result.runs[0]).toEqual(expect.objectContaining({ id: 'r1', courseName: 'Foundation', maxAbsencesAllowed: 2 }));
    // r1 got both learners; r2 has none.
    expect(result.runs[0].roster).toHaveLength(2);
    expect(result.runs[1].roster).toEqual([]);
    expect(result.runs[0].roster[0]).toEqual({
      enrollmentId: 'en1', empCode: '1001', fullName: 'Alice', enrollmentStatus: 'completed',
      allowedAbsences: 2, absenceCount: 1, eligibilityStatus: 'eligible',
      examLevelCode: 'A2', examLevelName: 'A2 Elementary', examDate: '2026-03-05',
    });
    expect(result.runs[0].roster[1]).toEqual(expect.objectContaining({ eligibilityStatus: 'not_eligible', examLevelCode: null, examDate: null }));
  });
});
