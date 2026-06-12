/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — reconcile drift expansion (audit PR C / DATA-011)
 * ──────────────────────────────────────────────────────────
 * Plants known drift in each of the 5 new check categories, runs the
 * service, and asserts the report contains the right detection.
 *
 * The audit said the reconciler caught 5 of ~20 drift classes. PR C
 * adds the next 5 HIGH/MED severity classes — these tests prove the
 * detections work end-to-end.
 */

const mongoose = require('mongoose');
const { getApp, getSeedData } = require('../setup');
const { runReconciliation } = require('../../services/reconcileService');

let seed;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await mongoose.disconnect();
});

// Convenience — wipe all transient state introduced by these tests
// so each describe block starts from a known baseline.
const cleanup = async () => {
  const Enrollment = require('../../models/Enrollment');
  const Schedule = require('../../models/Schedule');
  const Class = require('../../models/Class');
  const Team = require('../../models/Team');
  const User = require('../../models/User');
  const Counter = require('../../models/Counter');
  await Enrollment.deleteMany({ note: 'PR-C-test-fixture' });
  await Schedule.deleteMany({ roomLink: 'PR-C-test-fixture' });
  await Class.deleteMany({ classCode: /^PRC-/ });
  await Team.deleteMany({ name: /^PR-C-/ });
  await User.deleteMany({ empCode: /^PRC-/ });
  await Counter.deleteMany({ _id: { $in: ['empCode', 'classCode'] } });
};

beforeEach(cleanup);
// NOTE: no afterAll(cleanup) — the prior afterAll already disconnects
// mongoose, so a second cleanup would race against the closed connection.
// beforeEach already wipes everything between tests.

// ── CHECK 6 ────────────────────────────────────────────────

describe('reconcile: duplicate_active_enrollment', () => {
  test('plants two Active enrollments for same user → flagged', async () => {
    const Enrollment = require('../../models/Enrollment');
    const Team = require('../../models/Team');

    // Bypass the partial unique index on (userId, teamId, status:Active)
    // by creating two enrollments against DIFFERENT teams (which the
    // current index allows). This is the exact race DATA-001 is meant to
    // catch — the audit says reconcile is the safety net until the
    // global partial unique on userId lands.
    const teamA = await Team.create({
      name: 'PR-C-team-A',
      classId: seed.class1._id,
      leaderId: seed.leader._id,
      members: [seed.member1._id],
    });
    const teamB = await Team.create({
      name: 'PR-C-team-B',
      classId: seed.class2._id,
      leaderId: seed.leader._id,
      members: [seed.member1._id],
    });
    await Enrollment.create([
      { userId: seed.member1._id, teamId: teamA._id, classId: seed.class1._id, status: 'Active', note: 'PR-C-test-fixture' },
      { userId: seed.member1._id, teamId: teamB._id, classId: seed.class2._id, status: 'Active', note: 'PR-C-test-fixture' },
    ]);

    const report = await runReconciliation('manual');

    expect(report.summary.duplicate_active_enrollment).toBeGreaterThanOrEqual(1);
    const finding = report.issues.find(
      (i) => i.check === 'duplicate_active_enrollment' &&
             String(i.refs.userId) === String(seed.member1._id),
    );
    expect(finding).toBeDefined();
    expect(finding.detail.count).toBe(2);
  });
});

// ── CHECK 7 ────────────────────────────────────────────────

describe('reconcile: orphan_schedule_class', () => {
  test('schedule pointing to a non-existent classId is flagged', async () => {
    const Schedule = require('../../models/Schedule');

    const ghostClassId = new mongoose.Types.ObjectId(); // never created in DB
    const future = new Date(Date.now() + 7 * 24 * 3600_000);
    const sched = await Schedule.create({
      classId: ghostClassId,
      bookedTeamId: seed.team._id,
      startTime: future,
      endTime: new Date(future.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
      roomLink: 'PR-C-test-fixture',
    });

    const report = await runReconciliation('manual');

    expect(report.summary.orphan_schedule_class).toBeGreaterThanOrEqual(1);
    const finding = report.issues.find(
      (i) => i.check === 'orphan_schedule_class' &&
             String(i.refs.scheduleId) === String(sched._id),
    );
    expect(finding).toBeDefined();
    expect(String(finding.refs.classId)).toBe(String(ghostClassId));
  });
});

// ── CHECK 8 ────────────────────────────────────────────────

describe('reconcile: multi_team_class', () => {
  test('two non-deleted teams sharing a classId are flagged', async () => {
    const Team = require('../../models/Team');
    const Class = require('../../models/Class');

    const sharedClass = await Class.create({
      classCode: 'PRC-MTC-001',
      courseName: 'Test English Class', // valid courseName per seed setting
      totalSessions: 10,
    });
    await Team.create({
      name: 'PR-C-mtc-team-1',
      classId: sharedClass._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id],
    });
    await Team.create({
      name: 'PR-C-mtc-team-2',
      classId: sharedClass._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id],
    });

    const report = await runReconciliation('manual');

    expect(report.summary.multi_team_class).toBeGreaterThanOrEqual(1);
    const finding = report.issues.find(
      (i) => i.check === 'multi_team_class' &&
             String(i.refs.classId) === String(sharedClass._id),
    );
    expect(finding).toBeDefined();
    expect(finding.detail.count).toBe(2);
  });
});

// ── CHECK 9 ────────────────────────────────────────────────

describe('reconcile: counter_drift', () => {
  test('Counter.seq lower than max in-use empCode numeric → flagged', async () => {
    const User = require('../../models/User');
    const Counter = require('../../models/Counter');

    // Create a user with a high empCode, then plant a counter at a lower seq.
    await User.create({
      empCode: 'PRC-USR-009999',
      name: 'High-numbered user',
      role: 'Participant',
      password: 'drift-pwd-12345',
    });
    await Counter.create({ _id: 'empCode', seq: 5 }); // way lower than 9999

    const report = await runReconciliation('manual');

    expect(report.summary.counter_drift).toBeGreaterThanOrEqual(1);
    const finding = report.issues.find(
      (i) => i.check === 'counter_drift' && i.detail?.counter === 'empCode',
    );
    expect(finding).toBeDefined();
    expect(finding.detail.maxInUse).toBeGreaterThan(finding.detail.seq);
  });

  test('Counter.seq higher than max in-use is NOT flagged (healthy)', async () => {
    const User = require('../../models/User');
    const Counter = require('../../models/Counter');

    await User.create({
      empCode: 'PRC-USR-000050',
      name: 'Mid user',
      role: 'Participant',
      password: 'healthy-pwd-12345',
    });
    await Counter.create({ _id: 'empCode', seq: 200 });

    const report = await runReconciliation('manual');
    const finding = report.issues.find(
      (i) => i.check === 'counter_drift' && i.detail?.counter === 'empCode',
    );
    expect(finding).toBeUndefined();
  });
});

// ── CHECK 10 ───────────────────────────────────────────────

describe('reconcile: soft_deleted_in_team_members', () => {
  test('soft-deleted user lingering in Team.members is flagged', async () => {
    const User = require('../../models/User');
    const Team = require('../../models/Team');

    const toBeDeleted = await User.create({
      empCode: 'PRC-SD-' + Math.random().toString(16).slice(2, 6),
      name: 'About to be soft-deleted',
      role: 'Participant',
      password: 'sd-pwd-12345',
    });
    const team = await Team.create({
      name: 'PR-C-sd-team',
      classId: seed.class1._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id, toBeDeleted._id],
    });

    // Soft-delete the user DIRECTLY (bypass userController so the team-sync
    // cleanup is also bypassed — this is the exact drift the reconcile
    // check is meant to detect).
    await mongoose.connection.db.collection('users').updateOne(
      { _id: toBeDeleted._id },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );

    const report = await runReconciliation('manual');

    expect(report.summary.soft_deleted_in_team_members).toBeGreaterThanOrEqual(1);
    const finding = report.issues.find(
      (i) => i.check === 'soft_deleted_in_team_members' &&
             String(i.refs.teamId) === String(team._id) &&
             String(i.refs.userId) === String(toBeDeleted._id),
    );
    expect(finding).toBeDefined();
  });
});

// ── Regression: original 5 checks still work ───────────────

describe('reconcile: original 5 checks still produce summary keys', () => {
  test('summary contains all 12 check counters', async () => {
    const report = await runReconciliation('manual');
    const keys = Object.keys(report.summary.toObject ? report.summary.toObject() : report.summary);
    for (const expected of [
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
      'orphan_room_booking',
      'stale_waitlist_entry', // DATA-016
      'total',
    ]) {
      expect(keys).toContain(expected);
    }
  });
});
