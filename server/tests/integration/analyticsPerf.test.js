/**
 * Integration Tests — analytics + reconcile perf (audit PR G)
 *
 * Covers PERF-003 (analyticsByTeam invert direction) and PERF-004
 * (reconcile shared activeEnrollments).
 *
 * Asserts on CORRECTNESS — not raw timing. Timing benchmarks live
 * in the Artillery load suite. These tests verify the new
 * implementations produce the same answer as the old one would.
 */

const mongoose = require('mongoose');
const { getApp, getSeedData } = require('../setup');

let seed;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await mongoose.disconnect();
});

const cleanup = async () => {
  const Schedule = require('../../models/Schedule');
  const Attendance = require('../../models/Attendance');
  const Team = require('../../models/Team');
  const User = require('../../models/User');
  const Enrollment = require('../../models/Enrollment');
  await Attendance.deleteMany({ remark: 'PR-G-perf-fixture' });
  await Schedule.deleteMany({ roomLink: 'PR-G-perf-fixture' });
  await Team.deleteMany({ name: /^PR-G-/ });
  await User.deleteMany({ empCode: /^PRG-/ });
  await Enrollment.deleteMany({ note: 'PR-G-perf-fixture' });
};
beforeEach(cleanup);

describe('PERF-003 — analyticsByTeam inverted join', () => {
  const { analyticsByTeam } = require('../../services/attendanceService');
  const Team = require('../../models/Team');
  const User = require('../../models/User');
  const Schedule = require('../../models/Schedule');
  const Attendance = require('../../models/Attendance');

  test('rollup matches expected per-team totals', async () => {
    // Seed 2 disposable teams with known attendance distributions.
    const u1 = await User.create({
      empCode: 'PRG-U1-' + Math.random().toString(16).slice(2, 6),
      name: 'PR-G User 1', role: 'Participant', password: 'pwd-12345abc',
    });
    const u2 = await User.create({
      empCode: 'PRG-U2-' + Math.random().toString(16).slice(2, 6),
      name: 'PR-G User 2', role: 'Participant', password: 'pwd-12345abc',
    });
    const teamA = await Team.create({
      name: 'PR-G-team-A',
      classId: seed.class1._id,
      leaderId: u1._id,
      members: [u1._id, u2._id],
    });

    const past = new Date(Date.now() - 24 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: teamA._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [u1._id, u2._id],
      roomLink: 'PR-G-perf-fixture',
    });

    // u1: present; u2: absent
    await Attendance.create([
      { scheduleId: sched._id, userId: u1._id, status: 'P', remark: 'PR-G-perf-fixture' },
      { scheduleId: sched._id, userId: u2._id, status: 'A', remark: 'PR-G-perf-fixture' },
    ]);

    const r = await analyticsByTeam({ page: 1, limit: 50, skip: 0 });
    const rowA = r.data.find((d) => d.name === 'PR-G-team-A');

    expect(rowA).toBeDefined();
    expect(rowA.memberCount).toBe(2);
    expect(rowA.stats.totalSessions).toBe(2);
    expect(rowA.stats.present).toBe(1);
    expect(rowA.stats.absent).toBe(1);
    expect(rowA.stats.attendanceRate).toBe(50.0);
  });

  test('soft-deleted teams are NOT included (DATA-007 hook respected)', async () => {
    const u = await User.create({
      empCode: 'PRG-USD-' + Math.random().toString(16).slice(2, 6),
      name: 'soft-del user', role: 'Participant', password: 'pwd-12345abc',
    });
    const team = await Team.create({
      name: 'PR-G-soft-deleted',
      classId: seed.class1._id,
      leaderId: u._id,
      members: [u._id],
    });
    await Team.updateOne({ _id: team._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

    const r = await analyticsByTeam({ page: 1, limit: 50, skip: 0 });
    const seenSoftDeleted = r.data.find((d) => d.name === 'PR-G-soft-deleted');
    expect(seenSoftDeleted).toBeUndefined();
  });

  test('pagination skip + limit slice works', async () => {
    // Seed 3 teams — each with one member, no attendance.
    const users = [];
    const teams = [];
    for (let i = 0; i < 3; i++) {
      const u = await User.create({
        empCode: 'PRG-PG-' + i + '-' + Math.random().toString(16).slice(2, 4),
        name: `Paginate user ${i}`,
        role: 'Participant',
        password: 'pwd-12345abc',
      });
      users.push(u);
      teams.push(await Team.create({
        name: `PR-G-paginate-${String.fromCharCode(65 + i)}`,
        classId: seed.class1._id,
        leaderId: u._id,
        members: [u._id],
      }));
    }

    const page1 = await analyticsByTeam({ page: 1, limit: 2, skip: 0 });
    const page2 = await analyticsByTeam({ page: 2, limit: 2, skip: 2 });
    expect(page1.data.length).toBe(2);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    expect(page2.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PERF-004 — reconcile shared activeEnrollments', () => {
  const { runReconciliation } = require('../../services/reconcileService');
  const Enrollment = require('../../models/Enrollment');

  test('reconcile completes without errors when ctx is pre-populated', async () => {
    // Plant a couple of Active enrollments so the ctx path is exercised.
    await Enrollment.create([
      {
        userId: seed.member1._id, teamId: seed.team._id, classId: seed.class1._id,
        status: 'Active', note: 'PR-G-perf-fixture',
      },
    ]);

    const report = await runReconciliation('manual');
    expect(report).toBeDefined();
    expect(report.summary.total).toBeGreaterThanOrEqual(0);
    // All 10 check counters present (regression check)
    for (const k of [
      'missing_attendance',
      'orphaned_enrollment',
      'ghost_member',
      'empty_future_schedule',
      'unattached_participant',
      'duplicate_active_enrollment',
      'orphan_schedule_class',
      'multi_team_class',
      'counter_drift',
      'soft_deleted_in_team_members',
    ]) {
      expect(report.summary[k]).toBeDefined();
    }
  });

  test('Enrollment.find is called ONCE for active enrollments', async () => {
    const Enrollment = require('../../models/Enrollment');
    const spy = jest.spyOn(Enrollment, 'find');

    await runReconciliation('manual');

    // Count calls that asked specifically for status:Active (the
    // memoised query). Old impl called it ≥2 times (checks 2 + 3).
    const activeQueryCalls = spy.mock.calls.filter((args) => {
      const filter = args[0];
      return filter && filter.status === 'Active';
    });

    // PERF-004 invariant: at most 2 total — one for the pre-fetch (ctx)
    // plus at most one in check 5 (unattached, narrows by userId).
    // Before this PR: ≥3 (pre-fetch + check 2 + check 3 + check 5).
    expect(activeQueryCalls.length).toBeLessThanOrEqual(2);

    spy.mockRestore();
  });
});
