/**
 * Unit tests — policy/sessionInstructors (re-center Phase 3, DELTA B)
 * The UNION: cohort-teacher binding OR named internal trainer. Pure, no DB.
 */

const { isSessionInstructor, canMarkSession } = require('../../policy/sessionInstructors');

const teacherA = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'Teacher' };
const teacherB = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'Teacher' };
const admin = { _id: 'cccccccccccccccccccccccc', role: 'Admin' };

describe('isSessionInstructor', () => {
  test('true when actor id is in sessionInstructorIds (raw)', () => {
    expect(isSessionInstructor(teacherA, { sessionInstructorIds: [teacherA._id] })).toBe(true);
  });
  test('true when populated user docs', () => {
    expect(isSessionInstructor(teacherA, { sessionInstructorIds: [{ _id: teacherA._id }] })).toBe(true);
  });
  test('false when not listed / empty / missing', () => {
    expect(isSessionInstructor(teacherA, { sessionInstructorIds: [teacherB._id] })).toBe(false);
    expect(isSessionInstructor(teacherA, { sessionInstructorIds: [] })).toBe(false);
    expect(isSessionInstructor(teacherA, {})).toBe(false);
    expect(isSessionInstructor(null, { sessionInstructorIds: [teacherA._id] })).toBe(false);
  });
});

describe('canMarkSession UNION', () => {
  // A class WITH a bound teacher (teacherB) and a named instructor (teacherA).
  const classBoundToB = { teacherIds: [teacherB._id] };
  const schedule = { sessionInstructorIds: [teacherA._id] };

  test('named instructor (not the cohort teacher) is allowed via the UNION', () => {
    const d = canMarkSession(teacherA, classBoundToB, schedule);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('session-instructor');
  });

  test('the cohort teacher is still allowed (UNION never revokes them)', () => {
    const d = canMarkSession(teacherB, classBoundToB, schedule);
    expect(d.allowed).toBe(true);
  });

  test('an unrelated teacher is denied with the original reason', () => {
    const stranger = { _id: 'dddddddddddddddddddddddd', role: 'Teacher' };
    const d = canMarkSession(stranger, classBoundToB, schedule);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('teacher-not-bound-to-class');
  });

  test('Admin is always allowed (base decision wins)', () => {
    expect(canMarkSession(admin, classBoundToB, { sessionInstructorIds: [] }).allowed).toBe(true);
  });
});

describe('canMarkSession assigned_only (facilitatorPolicy.visibility)', () => {
  const classBoundToB = { teacherIds: [teacherB._id] };
  const schedule = { sessionInstructorIds: [teacherA._id] };
  const opts = { assignedOnly: true };

  test('the named instructor is still allowed', () => {
    expect(canMarkSession(teacherA, classBoundToB, schedule, opts).allowed).toBe(true);
  });

  test('the cohort-bound teacher is NOW denied (binding no longer grants access)', () => {
    const d = canMarkSession(teacherB, classBoundToB, schedule, opts);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('not-assigned-instructor');
  });

  test('Admin is unaffected — still allowed', () => {
    expect(canMarkSession(admin, classBoundToB, schedule, opts).allowed).toBe(true);
  });
});
