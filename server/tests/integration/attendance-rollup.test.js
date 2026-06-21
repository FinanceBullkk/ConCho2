/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — attendance-rollup dual-backend repository (Phase 3 Wave-A)
 * ──────────────────────────────────────────────────────────
 * Per-team attendance rollup ported to dual-backend behind one interface. The
 * Mongo impl reuses the REAL production query (analyticsByTeam); this pins it
 * plus that the PG impl loads without opening a connection. Exact Mongo↔PG
 * numeric parity on real Postgres is proven by
 * scripts/dev-tools/pg-attendance-rollup-parity.js (PASS on Neon) — the CI
 * Postgres lane will run it automatically in Phase 3.
 *
 * Uses fresh, isolated users (no other attendance) so the global rollup gives
 * exact counts for this team regardless of seed data.
 */

const mongoose = require('mongoose');
const { getApp } = require('../setup');
const rollup = require('../../services/attendance-rollup');

const User = require('../../models/User');
const Team = require('../../models/Team');
const Attendance = require('../../models/Attendance');

const uniq = () => Math.random().toString(16).slice(2, 8);
let teamId;

beforeAll(async () => {
  await getApp();
  const mk = async (n) => User.create({
    empCode: `AR${n}-${uniq()}`, name: `AR User ${n}`, email: `ar${n}-${uniq()}@example.io`,
    role: 'Participant', department: 'Eng', password: 'Passw0rd!23',
  });
  const [u1, u2] = [await mk(1), await mk(2)];
  const team = await Team.create({ name: `AR Team ${uniq()}`, members: [u1._id, u2._id] });
  teamId = String(team._id);

  // u1: P,P ; u2: P,A → total 4, present 3, absent 1, rate 75.0
  const sid = () => new mongoose.Types.ObjectId();
  await Attendance.create([
    { scheduleId: sid(), userId: u1._id, status: 'P' },
    { scheduleId: sid(), userId: u1._id, status: 'P' },
    { scheduleId: sid(), userId: u2._id, status: 'P' },
    { scheduleId: sid(), userId: u2._id, status: 'A' },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('attendance-rollup dual-backend repository', () => {
  test('factory + both impls load (PG impl loads without opening a connection)', () => {
    expect(typeof rollup.getTeamAttendanceRollup).toBe('function');
    expect(typeof rollup.impls.mongo.getTeamAttendanceRollup).toBe('function');
    expect(typeof rollup.impls.pg.getTeamAttendanceRollup).toBe('function');
  });

  test('mongo impl rolls up per-team attendance (exact, isolated team)', async () => {
    const all = await rollup.impls.mongo.getTeamAttendanceRollup();
    const mine = all.find((t) => t.teamId === teamId);
    expect(mine).toMatchObject({
      memberCount: 2, total: 4, present: 3, absent: 1, late: 0, excused: 0, rate: 75,
    });
  });
});
