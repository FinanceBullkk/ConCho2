/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — attendance-by-class dual-backend repository (Phase 3)
 * ──────────────────────────────────────────────────────────
 * Per-class attendance roster ported to dual-backend behind one interface
 * (completes the attendance-analytics trilogy: by-employee, by-team, by-class).
 * Pins the Mongo path (reuses the real analyticsByClass) + that the PG impl
 * loads without a connection. Exact Mongo↔PG parity (incl. the soft-delete +
 * cancelled-session + other-class traps) is proven on real Postgres by
 * tests/pg-parity/attendance-by-class.pg.test.js.
 *
 * Fresh isolated class/users so the roster is exact; the traps that must be
 * EXCLUDED: a soft-deleted user, a cancelled session, another class's session.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const classRollup = require('../../services/attendance-by-class');

const User = require('../../models/User');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');

const uniq = () => Math.random().toString(16).slice(2, 8);
const at = (h, day = 1) => new Date(Date.UTC(2026, 0, day, h, 0, 0));

let classA; let classB;
let s1; let s2; let s3; // classA scheduled
let code1; let code2; let codeDeleted;

beforeAll(async () => {
  await getApp();
  classA = new mongoose.Types.ObjectId();
  classB = new mongoose.Types.ObjectId();

  const mk = (n, isDeleted = false) => User.create({
    empCode: `EMP${n}-${uniq()}`, name: `Emp ${n}`, email: `emp${n}-${uniq()}@example.io`,
    role: 'Participant', department: 'Eng', password: 'Passw0rd!23', isDeleted,
  });
  const u1 = await mk(1); code1 = u1.empCode;
  const u2 = await mk(2); code2 = u2.empCode;
  const u3 = await mk(3, true); codeDeleted = u3.empCode;

  const sched = (classId, startH, status = 'scheduled', day = 1) => Schedule.create({
    classId, startTime: at(startH, day), endTime: at(startH + 1, day), status,
  });
  s1 = await sched(classA, 10);                 // classA live
  s2 = await sched(classA, 11);                 // classA live
  s3 = await sched(classA, 10, 'scheduled', 2); // classA live (next day)
  const sc = await sched(classA, 13, 'cancelled'); // TRAP: cancelled → excluded
  const sb = await sched(classB, 10);              // TRAP: other class → excluded

  await Attendance.create([
    { scheduleId: s1._id, userId: u1._id, status: 'P' },
    { scheduleId: s2._id, userId: u1._id, status: 'A' },
    { scheduleId: s3._id, userId: u1._id, status: 'P' }, // u1: total 3, present 2 → 66.7
    { scheduleId: s1._id, userId: u2._id, status: 'P' },
    { scheduleId: s2._id, userId: u2._id, status: 'P' }, // u2: total 2, present 2 → 100
    { scheduleId: sc._id, userId: u1._id, status: 'P' }, // TRAP: cancelled session
    { scheduleId: sb._id, userId: u1._id, status: 'A' }, // TRAP: other class
    { scheduleId: s1._id, userId: u3._id, status: 'P' }, // TRAP: soft-deleted user
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('attendance-by-class dual-backend repository', () => {
  test('factory + both impls load (PG impl loads without opening a connection)', () => {
    expect(typeof classRollup.getClassAttendance).toBe('function');
    expect(typeof classRollup.impls.mongo.getClassAttendance).toBe('function');
    expect(typeof classRollup.impls.pg.getClassAttendance).toBe('function');
  });

  test('mongo impl builds the per-class roster + applies all three traps (exact)', async () => {
    const { schedules, roster } = await classRollup.impls.mongo.getClassAttendance(String(classA));

    // only the 3 live classA sessions, ordered by startTime
    expect(schedules.map((s) => s.id)).toEqual([String(s1._id), String(s2._id), String(s3._id)]);

    const find = (c) => roster.find((r) => r.empCode === c);
    expect(find(code1)).toMatchObject({
      total: 3, present: 2, rate: 66.7,
      sessions: { [String(s1._id)]: 'P', [String(s2._id)]: 'A', [String(s3._id)]: 'P' },
    });
    expect(find(code2)).toMatchObject({ total: 2, present: 2, rate: 100 });
    expect(find(codeDeleted)).toBeUndefined();       // soft-deleted user excluded
    // cancelled + other-class sessions never surface in any sessions map
    const allSessionIds = roster.flatMap((r) => Object.keys(r.sessions));
    expect(new Set(allSessionIds)).toEqual(new Set([String(s1._id), String(s2._id), String(s3._id)]));
  });
});
