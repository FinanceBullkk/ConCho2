const {
  transformPhase2, attendanceStatus, toTimestamp,
} = require('../../domains/english-training/import/phase2-transform');

const D = (value) => new Date(value);

function base() {
  return {
    courses: [{ id: 'course-1', course_name: 'Communication 1' }],
    cohorts: [{ id: 'cohort-1', class_code: 'EL001' }],
    courseRuns: [{
      id: 'run-1', cohort_id: 'cohort-1', course_id: 'course-1', expected_units_snapshot: 1,
    }],
    employees: [{ id: 'employee-1', emp_code: '1001' }],
    enrollments: [{ id: 'enrollment-1', course_run_id: 'run-1', employee_id: 'employee-1' }],
  };
}

function sheets() {
  return {
    CLASS_SESSIONS: [
      { __row: 2, 'Class Code': 'EL001', 'Course Name': 'Communication 1', 'Session No': 1, Date: D('2026-01-10T10:00:00Z') },
      { __row: 3, 'Class Code': 'EL001', 'Course Name': 'Communication 1', 'Session No': 2, Date: D('2026-08-10T10:00:00Z') },
    ],
    ATTENDANCE: [
      { __row: 2, 'Emp Code': 1001, 'Class Code': 'EL001', 'Course Name': 'Communication 1', 'Session No': 1, Date: D('2026-01-10T10:00:00Z'), Status: 'Present' },
      { __row: 3, 'Emp Code': '1001.0', 'Class Code': 'EL001', 'Course Name': 'Communication 1', 'Session No': 1, Date: D('2026-01-10T10:00:00Z'), Status: 'Present', 'Dropped Enrollment': 'Yes' },
      { __row: 4, 'Emp Code': 1001, 'Class Code': 'EL001', 'Course Name': 'Communication 1', 'Session No': 2, Date: D('2026-08-11T10:00:00Z'), Status: 'Absent' },
    ],
  };
}

const issueCodes = (out) => out.issues.map((issue) => issue.code);

describe('English-training Phase-2 transform', () => {
  test('loads unique session units and deduplicates identical attendance evidence', () => {
    const out = transformPhase2(sheets(), base(), D('2026-07-18T00:00:00Z'));
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions.map((session) => session.status)).toEqual(['held', 'scheduled']);
    expect(out.attendance).toHaveLength(2);
    expect(out.ignoredExactDuplicates).toBe(1);
    expect(out.attendance[0].source_enrollment_dropped).toBe(true);
    expect(out.attendance[0].meta.duplicateSourceRows).toEqual([3]);
    expect(issueCodes(out)).toContain('attendance_duplicate_exact');
  });

  test('loads policy-overrun units but records the anomaly', () => {
    const out = transformPhase2(sheets(), base(), D('2026-07-18T00:00:00Z'));
    expect(out.sessions[1].meta).toEqual({ beyondExpectedUnits: true });
    expect(issueCodes(out)).toContain('session_unit_out_of_range');
  });

  test('uses CLASS_SESSIONS date as authority and records attendance date mismatch', () => {
    const out = transformPhase2(sheets(), base(), D('2026-07-18T00:00:00Z'));
    expect(out.attendance[1].meta).toEqual({
      sourceDate: '2026-08-11T10:00:00.000Z',
      canonicalSessionDate: '2026-08-10T10:00:00.000Z',
    });
    expect(issueCodes(out)).toContain('attendance_date_mismatch');
  });

  test('normalizers reject unsupported statuses and invalid dates', () => {
    expect(attendanceStatus('Present')).toBe('present');
    expect(attendanceStatus('Late')).toBeNull();
    expect(toTimestamp('not-a-date')).toBeNull();
  });

  test('does not misclassify conflicting duplicate attendance as exact evidence', () => {
    const input = sheets();
    input.ATTENDANCE[1].Status = 'Absent';

    const out = transformPhase2(input, base(), D('2026-07-18T00:00:00Z'));

    expect(out.ignoredExactDuplicates).toBe(0);
    expect(out.ignoredConflictingDuplicates).toBe(1);
    expect(issueCodes(out)).toContain('attendance_duplicate_conflict');
    expect(out.attendance[0].status).toBe('present');
  });
});
