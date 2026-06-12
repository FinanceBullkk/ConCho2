/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — reconcile CHECK 12: stale_waitlist_entry (DATA-016)
 * ──────────────────────────────────────────────────────────
 * FIFO promotion skips past sessions and queue dissolution only fires on
 * the cancel path, so a 'waiting' WaitlistEntry can rot on a session that
 * can never seat it. Plants each stale shape (past / cancelled / deleted
 * session), runs the service, and asserts detection — plus the negative
 * paths (future live session, non-waiting statuses) stay unflagged.
 */

const mongoose = require('mongoose');
const { getApp, getSeedData } = require('../setup');
const { runReconciliation } = require('../../services/reconcileService');

const Schedule = require('../../models/Schedule');
const WaitlistEntry = require('../../models/WaitlistEntry');

let seed;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await mongoose.disconnect();
});

const FIXTURE = 'DATA-016-test-fixture';

const cleanup = async () => {
  const scheds = await Schedule.find({ roomLink: FIXTURE }).select('_id').lean();
  await WaitlistEntry.deleteMany({
    scheduleId: { $in: scheds.map((s) => s._id).concat(plantedGhostIds) },
  });
  await Schedule.deleteMany({ roomLink: FIXTURE });
};
let plantedGhostIds = [];

beforeEach(async () => {
  await cleanup();
  plantedGhostIds = [];
});

// Distinct startTimes per session — the partial unique {classId,startTime}
// index only spans status:'scheduled', but keeping them unique is simplest.
let hourOffset = 0;
const makeSchedule = (overrides = {}) => {
  hourOffset += 1;
  const base = overrides.startTime
    || new Date(Date.now() + (24 + hourOffset) * 3600_000); // default: future
  return Schedule.create({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime: base,
    endTime: new Date(base.getTime() + 3600_000),
    enrolledUsers: [seed.member1._id],
    roomLink: FIXTURE,
    ...overrides,
  });
};

describe('reconcile: stale_waitlist_entry (DATA-016)', () => {
  test('waiting row on a PAST live session → flagged (session already ended)', async () => {
    const past = new Date(Date.now() - 48 * 3600_000);
    const sched = await makeSchedule({ startTime: past });
    const entry = await WaitlistEntry.create({
      scheduleId: sched._id, classId: sched.classId, userId: seed.member1._id,
    });

    const report = await runReconciliation('manual');

    expect(report.summary.stale_waitlist_entry).toBeGreaterThanOrEqual(1);
    const finding = report.issues.find(
      (i) => i.check === 'stale_waitlist_entry' &&
             String(i.refs.scheduleId) === String(sched._id),
    );
    expect(finding).toBeDefined();
    expect(String(finding.refs.userId)).toBe(String(seed.member1._id));
    expect(finding.detail.reason).toBe('session already ended');
    expect(String(entry._id)).toBeTruthy();
  });

  test('waiting row on a CANCELLED session → flagged (dissolution bypassed)', async () => {
    const sched = await makeSchedule({ status: 'cancelled' });
    await WaitlistEntry.create({
      scheduleId: sched._id, classId: sched.classId, userId: seed.member1._id,
    });

    const report = await runReconciliation('manual');

    const finding = report.issues.find(
      (i) => i.check === 'stale_waitlist_entry' &&
             String(i.refs.scheduleId) === String(sched._id),
    );
    expect(finding).toBeDefined();
    expect(finding.detail.reason).toMatch(/cancelled/);
  });

  test('waiting row whose session doc is GONE → flagged (session deleted)', async () => {
    const ghostScheduleId = new mongoose.Types.ObjectId(); // never created
    plantedGhostIds.push(ghostScheduleId);
    await WaitlistEntry.create({
      scheduleId: ghostScheduleId, classId: seed.class1._id, userId: seed.member1._id,
    });

    const report = await runReconciliation('manual');

    const finding = report.issues.find(
      (i) => i.check === 'stale_waitlist_entry' &&
             String(i.refs.scheduleId) === String(ghostScheduleId),
    );
    expect(finding).toBeDefined();
    expect(finding.detail.reason).toBe('session deleted');
  });

  test('waiting row on a FUTURE live session → NOT flagged', async () => {
    const sched = await makeSchedule(); // future, status scheduled
    await WaitlistEntry.create({
      scheduleId: sched._id, classId: sched.classId, userId: seed.member1._id,
    });

    const report = await runReconciliation('manual');

    const finding = report.issues.find(
      (i) => i.check === 'stale_waitlist_entry' &&
             String(i.refs.scheduleId) === String(sched._id),
    );
    expect(finding).toBeUndefined();
  });

  test('resolved rows (promoted/withdrawn/cancelled) on a past session → NOT flagged', async () => {
    const past = new Date(Date.now() - 72 * 3600_000);
    const sched = await makeSchedule({ startTime: past });
    await WaitlistEntry.create([
      { scheduleId: sched._id, classId: sched.classId, userId: seed.member1._id, status: 'promoted', promotedAt: past },
      { scheduleId: sched._id, classId: sched.classId, userId: seed.leader._id, status: 'withdrawn' },
    ]);

    const report = await runReconciliation('manual');

    const findings = report.issues.filter(
      (i) => i.check === 'stale_waitlist_entry' &&
             String(i.refs.scheduleId) === String(sched._id),
    );
    expect(findings).toHaveLength(0);
  });
});
