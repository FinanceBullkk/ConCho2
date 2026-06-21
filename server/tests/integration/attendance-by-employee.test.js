/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — attendance-by-employee dual-backend repository (Phase 3)
 * ──────────────────────────────────────────────────────────
 * Per-employee attendance rollup ported to dual-backend behind one interface.
 * Pins the Mongo path (reuses the real analyticsByEmployee) + that the PG impl
 * loads without a connection. Exact Mongo↔PG parity (incl. the soft-delete trap)
 * is proven on real Postgres by tests/pg-parity/attendance-by-employee.pg.test.js.
 *
 * Fresh isolated users so the global rollup gives exact counts; one is
 * soft-deleted and must NOT appear.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const empRollup = require('../../services/attendance-by-employee');

const User = require('../../models/User');
const Attendance = require('../../models/Attendance');

const uniq = () => Math.random().toString(16).slice(2, 8);
let code1; let code2; let codeDeleted;

beforeAll(async () => {
  await getApp();
  // Return the created doc directly — a soft-deleted user can't be re-fetched
  // via findOne (the User soft-delete hook would hide it).
  const mk = (n, isDeleted = false) => User.create({
    empCode: `EMP${n}-${uniq()}`, name: `Emp ${n}`, email: `emp${n}-${uniq()}@example.io`,
    role: 'Participant', department: 'Eng', password: 'Passw0rd!23', isDeleted,
  });
  const u1 = await mk(1); code1 = u1.empCode;
  const u2 = await mk(2); code2 = u2.empCode;
  const u3 = await mk(3, true); codeDeleted = u3.empCode;

  const sid = () => new mongoose.Types.ObjectId();
  await Attendance.create([
    { scheduleId: sid(), userId: u1._id, status: 'P' },
    { scheduleId: sid(), userId: u1._id, status: 'P' },
    { scheduleId: sid(), userId: u1._id, status: 'A' },     // u1: total 3, present 2 → 66.7
    { scheduleId: sid(), userId: u2._id, status: 'P' },     // u2: total 1, present 1 → 100
    { scheduleId: sid(), userId: u3._id, status: 'P' },     // u3 soft-deleted → excluded
    { scheduleId: sid(), userId: u3._id, status: 'P' },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('attendance-by-employee dual-backend repository', () => {
  test('factory + both impls load (PG impl loads without opening a connection)', () => {
    expect(typeof empRollup.getEmployeeAttendanceRollup).toBe('function');
    expect(typeof empRollup.impls.mongo.getEmployeeAttendanceRollup).toBe('function');
    expect(typeof empRollup.impls.pg.getEmployeeAttendanceRollup).toBe('function');
  });

  test('mongo impl rolls up per-employee + excludes soft-deleted (exact)', async () => {
    const all = await empRollup.impls.mongo.getEmployeeAttendanceRollup();
    const find = (c) => all.find((e) => e.empCode === c);
    expect(find(code1)).toMatchObject({ total: 3, present: 2, absent: 1, late: 0, excused: 0, rate: 66.7 });
    expect(find(code2)).toMatchObject({ total: 1, present: 1, rate: 100 });
    expect(find(codeDeleted)).toBeUndefined(); // soft-deleted employee excluded
  });
});
