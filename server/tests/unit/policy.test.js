/**
 * Unit tests for the policy module (audit PR 5 — AUTHZ-001).
 *
 * Policy functions are pure → no DB needed; we drive them directly with
 * plain JS objects standing in for actor + class docs.
 */

const evaluationPolicy = require('../../policy/evaluation');
const attendancePolicy = require('../../policy/attendance');

const admin = { _id: 'admin-id', role: 'Admin' };
const teacherA = { _id: 'teacher-A', role: 'Teacher' };
const teacherB = { _id: 'teacher-B', role: 'Teacher' };
const participant = { _id: 'p-1', role: 'Participant' };

const classEmpty = { _id: 'c1', teacherIds: [] };
const classBoundA = { _id: 'c2', teacherIds: ['teacher-A'] };
const classBoundB = { _id: 'c3', teacherIds: ['teacher-B'] };

describe('evaluation.canWrite', () => {
  test('Admin always allowed', () => {
    expect(evaluationPolicy.canWrite(admin, classBoundB).allowed).toBe(true);
  });
  test('Teacher bound to class is allowed', () => {
    expect(evaluationPolicy.canWrite(teacherA, classBoundA).allowed).toBe(true);
  });
  test('Teacher NOT bound is denied with reason teacher-not-bound-to-class', () => {
    const d = evaluationPolicy.canWrite(teacherA, classBoundB);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('teacher-not-bound-to-class');
  });
  test('Teacher on a class with empty teacherIds falls through (graceful migration)', () => {
    const d = evaluationPolicy.canWrite(teacherA, classEmpty);
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe('no-binding-set');
  });
  test('Participant is denied', () => {
    expect(evaluationPolicy.canWrite(participant, classBoundA).allowed).toBe(false);
  });
  test('No actor is denied', () => {
    expect(evaluationPolicy.canWrite(null, classBoundA).allowed).toBe(false);
  });
});

describe('evaluation.canRead', () => {
  test('Admin always allowed', () => {
    expect(evaluationPolicy.canRead(admin, classBoundB).allowed).toBe(true);
  });
  test('Teacher bound is allowed', () => {
    expect(evaluationPolicy.canRead(teacherA, classBoundA).allowed).toBe(true);
  });
  test('Teacher not bound is denied', () => {
    expect(evaluationPolicy.canRead(teacherA, classBoundB).allowed).toBe(false);
  });
  test('Participant own-only — denied without eval', () => {
    expect(evaluationPolicy.canRead(participant, classBoundA).allowed).toBe(false);
  });
  test('Participant reading own eval is allowed', () => {
    const e = { userId: 'p-1' };
    expect(evaluationPolicy.canRead(participant, classBoundA, e).allowed).toBe(true);
  });
  test('Participant reading another user is denied', () => {
    const e = { userId: 'p-2' };
    const d = evaluationPolicy.canRead(participant, classBoundA, e);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('participant-cross-user');
  });
});

describe('attendance.canMark', () => {
  test('Admin always allowed', () => {
    expect(attendancePolicy.canMark(admin, classBoundB).allowed).toBe(true);
  });
  test('Teacher bound is allowed', () => {
    expect(attendancePolicy.canMark(teacherA, classBoundA).allowed).toBe(true);
  });
  test('Teacher not bound is denied', () => {
    expect(attendancePolicy.canMark(teacherA, classBoundB).allowed).toBe(false);
  });
  test('Empty teacherIds → graceful permissive', () => {
    expect(attendancePolicy.canMark(teacherA, classEmpty).allowed).toBe(true);
  });
  test('Participant denied', () => {
    expect(attendancePolicy.canMark(participant, classBoundA).allowed).toBe(false);
  });
});

describe('attendance.canReadBySchedule', () => {
  test('alias for canMark — same decision', () => {
    expect(attendancePolicy.canReadBySchedule(teacherA, classBoundB).allowed)
      .toBe(attendancePolicy.canMark(teacherA, classBoundB).allowed);
  });
});
