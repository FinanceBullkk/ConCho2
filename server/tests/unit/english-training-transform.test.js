// Pure unit tests for the English-training import transform + normalization.
// No DB, no setup.js → safe to run anywhere (never truncates Postgres).
// Locks the owner-decided mappings (plan §4 + data-quality decisions).

const { transform } = require('../../domains/english-training/import/transform');
const n = require('../../domains/english-training/import/normalize');

const D = (s) => new Date(s);

function fixture() {
  return {
    COURSE_PLAN: [
      { __row: 2, 'Course Name': 'Business English', 'Expected Sessions': 16 },
      { __row: 3, 'Course Name': 'Foundation', 'Expected Sessions': 10 },
    ],
    STUDENTS: [
      { __row: 2, 'Emp Code': '1001', 'Full Name': 'Alice', BU: 'X', ROLE: 'DEV', Status: 'Active', 'Drop reason': null },
      { __row: 3, 'Emp Code': 1002.0, 'Full Name': 'Bob', BU: null, ROLE: null, Status: 'Stopped', 'Drop reason': 'Resign' },
      { __row: 4, 'Emp Code': '1003', 'Full Name': 'Cara', BU: 'Y', ROLE: 'QC', Status: 'Completed', 'Drop reason': 'High workload' },
      { __row: 5, 'Emp Code': null, 'Full Name': 'Ghost' },
    ],
    CLASSES: [
      { __row: 2, 'Class Code': 'EL001', 'Course Name': 'Business English', 'Expected Sessions': 16, 'Start Date': D('2026-01-01'), 'End Date': D('2026-06-01') },
      { __row: 3, 'Class Code': 'EL001', 'Course Name': 'Foundation', 'Expected Sessions': 10, 'Start Date': D('2026-02-01'), 'End Date': null },
      { __row: 4, 'Class Code': 'EL002', 'Course Name': 'Ghost Course', 'Start Date': D('2026-03-01') },
    ],
    ENROLLMENTS: [
      { __row: 2, 'Emp Code': 1001.0, 'Class Code': 'EL001', 'Course Name': 'Business English', Status: 'Active', 'Start Date': D('2026-01-02') },
      { __row: 3, 'Emp Code': '1001', 'Class Code': 'EL001', 'Course Name': 'Foundation', Status: 'Active', 'Start Date': D('2026-02-02') },
      { __row: 4, 'Emp Code': '1003', 'Class Code': 'EL001', 'Course Name': 'Business English', Status: 'Completed', 'Start Date': D('2026-01-02') },
      { __row: 5, 'Emp Code': '1002', 'Class Code': 'EL001', 'Course Name': 'Business English', Status: 'Waiting for class', 'Start Date': null },
    ],
    PIC: [
      { __row: 2, 'Class Code': 'EL001', PIC: 'Coach X', 'EMP Code': '1001', Mail: 'x@co' },
      { __row: 3, 'Class Code': 'EL003', PIC: 'Coach Y', 'EMP Code': null, Mail: null },
    ],
  };
}

const codes = (out) => out.issues.reduce((a, i) => ((a[i.code] = (a[i.code] || 0) + 1), a), {});

describe('normalize', () => {
  test('normCode strips Excel float suffix', () => {
    expect(n.normCode(1002.0)).toBe('1002');
    expect(n.normCode('237050.0')).toBe('237050');
    expect(n.normCode(null)).toBeNull();
  });
  test('slug builds a stable course code', () => {
    expect(n.slug('Business English')).toBe('business-english');
    expect(n.slug('Extension of Foundation')).toBe('extension-of-foundation');
  });
  test('employmentStatus: only Resign is inactive', () => {
    expect(n.employmentStatus('Resign')).toBe('inactive');
    expect(n.employmentStatus('High workload')).toBe('active');
    expect(n.employmentStatus(null)).toBe('active');
  });
  test('enrollmentStatus map incl. waiting', () => {
    expect(n.enrollmentStatus('Active')).toBe('active');
    expect(n.enrollmentStatus('Stopped')).toBe('dropped');
    expect(n.enrollmentStatus('Waiting for class')).toBe('waiting');
    expect(n.enrollmentStatus('???')).toBeNull();
  });
});

describe('transform', () => {
  const out = transform(fixture(), D('2026-07-18'));

  test('courses slugged with max_absences=2', () => {
    expect(out.courses).toHaveLength(2);
    const be = out.courses.find((c) => c.course_name === 'Business English');
    expect(be.course_code).toBe('business-english');
    expect(be.max_absences_allowed).toBe(2);
  });

  test('employees: resign→inactive, others active; missing emp recorded', () => {
    expect(out.employees).toHaveLength(3); // Ghost row skipped
    expect(out.employees.find((e) => e.emp_code === '1002').employment_status).toBe('inactive');
    expect(out.employees.find((e) => e.emp_code === '1001').employment_status).toBe('active');
    const c = codes(out);
    expect(c.missing_emp_code).toBe(1);
    expect(c.employee_resigned).toBe(1);
    expect(c.missing_bu).toBe(1);
    expect(c.missing_role).toBe(1);
  });

  test('course runs: unknown course skipped, run_number always 1', () => {
    expect(out.courseRuns).toHaveLength(2);           // EL002/Ghost skipped
    expect(out.courseRuns.every((r) => r.run_number === 1)).toBe(true);
    expect(codes(out).unknown_course).toBe(1);
    const be = out.courseRuns.find((r) => r.expected_units_snapshot === 16);
    expect(be.status).toBe('completed');              // End Date past 'now'
  });

  test('cohorts: PIC-only cohort flagged, still created', () => {
    const classCodes = out.cohorts.map((c) => c.class_code).sort();
    expect(classCodes).toEqual(['EL001', 'EL002', 'EL003']);
    expect(codes(out).cohort_without_course_run).toBe(1); // EL003
  });

  test('memberships derived distinct (emp, cohort)', () => {
    expect(out.memberships).toHaveLength(3);           // 1001, 1002, 1003 in EL001
    expect(out.memberships.find((m) => m.status === 'active')).toBeTruthy(); // 1001 has active
  });

  test('multi-active kept BOTH active + flagged (soft rule)', () => {
    const active1001 = out.enrollments.filter(
      (e) => e.employee_id === out.employees.find((x) => x.emp_code === '1001').id && e.status === 'active',
    );
    expect(active1001).toHaveLength(2);                // not demoted
    expect(active1001.every((e) => e.meta && e.meta.dq === 'multi_active')).toBe(true);
    expect(codes(out).multi_active_enrollment).toBe(1);
  });

  test('waiting status preserved; membership start null recorded', () => {
    const waiting = out.enrollments.find((e) => e.status === 'waiting');
    expect(waiting).toBeTruthy();
    expect(codes(out).missing_membership_start).toBe(1); // 1002 had no start date
  });

  test('reconcile: source vs loaded per sheet', () => {
    expect(out.reconcile.STUDENTS).toEqual({ source: 4, loaded: 3 });
    expect(out.reconcile.ENROLLMENTS).toEqual({ source: 4, loaded: 4 });
    expect(out.reconcile.CLASSES).toEqual({ source: 3, loaded: 2 });
  });
});
