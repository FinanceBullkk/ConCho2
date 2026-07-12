/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — export row-cap (audit PR D / PERF-001)
 * ──────────────────────────────────────────────────────────
 * The audit identified an OOM at ~100k attendance rows because
 * generateExcel buffers the whole workbook in heap. The mitigation is a
 * hard cap that refuses oversized exports with 413, BEFORE claiming any
 * records (claiming + then failing would leave rows stuck in EXPORTING).
 *
 * These tests use EXPORT_MAX_ROWS=2 env override so we don't need to
 * seed 50,000 rows just to assert the gate fires.
 */

const { getApp, getSeedData, teardown } = require('../setup');
const { deleteActiveRowsWhere, countActiveRowsWhere, updateActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let seed;

const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  process.env = ORIGINAL_ENV;
  await teardown();
});

const cleanup = async () => {
  await deleteActiveRowsWhere('Attendance', { remark: 'PR-D-row-cap-fixture' });
  await deleteActiveRowsWhere('Schedule', { roomLink: 'PR-D-row-cap-fixture' });
};
beforeEach(cleanup);

// Helper: seed N attendance records for the same past schedule. Returns the
// created attendance docs so a caller can mutate them by id.
const seedAttendance = async (n) => {
  const past = new Date(Date.now() - 24 * 3600_000);
  const sched = await fx.createSchedule({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime: past,
    endTime: new Date(past.getTime() + 60 * 60_000),
    enrolledUsers: [],
    roomLink: 'PR-D-row-cap-fixture',
  });

  const created = [];
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-await-in-loop
    const u = await fx.createUser({
      empCode: 'CAP-' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      name: `Cap user ${i}`,
      role: 'Participant',
      password: 'cap-pwd-12345',
    });
    // eslint-disable-next-line no-await-in-loop
    created.push(await fx.createAttendance({
      scheduleId: sched._id,
      userId: u._id,
      status: 'P',
      remark: 'PR-D-row-cap-fixture',
      syncStatus: 'PENDING',
    }));
  }
  return created;
};

// enforceRowCap reads EXPORT_MAX_ROWS at call-time, so we just set the
// env before each test — no need to reset modules (which would break the
// shared app/db connections from setup.js).
const exportService = require('../../services/exportService');

describe('PERF-001 — export row cap', () => {
  test('exports under the cap succeed normally', async () => {
    process.env.EXPORT_MAX_ROWS = '10';
    await seedAttendance(3);

    const r = await exportService.exportAttendance({ includeExported: false });
    expect(r.recordCount).toBe(3);
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
  });

  test('exports OVER the cap throw 413 ServiceError and do NOT claim any rows', async () => {
    process.env.EXPORT_MAX_ROWS = '2';
    await seedAttendance(5);

    let err = null;
    try {
      await exportService.exportAttendance({ includeExported: false });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(413);
    expect(err.message).toMatch(/too large|exceeds/i);

    // CRITICAL: no rows were claimed — they're still PENDING.
    // Otherwise admin sees 413 + records stuck in EXPORTING limbo.
    const stuck = await countActiveRowsWhere('Attendance', {
      remark: 'PR-D-row-cap-fixture',
      syncStatus: 'EXPORTING',
    });
    expect(stuck).toBe(0);
    const stillPending = await countActiveRowsWhere('Attendance', {
      remark: 'PR-D-row-cap-fixture',
      syncStatus: 'PENDING',
    });
    expect(stillPending).toBe(5);
  });

  test('re-export (includeExported:true) also respects the cap', async () => {
    process.env.EXPORT_MAX_ROWS = '2';
    const atts = await seedAttendance(4);

    // Mark all as EXPORTED so they're picked up by the includeExported path.
    await Promise.all(
      atts.map((a) => updateActiveRow('Attendance', a._id, { syncStatus: 'EXPORTED' })),
    );

    let err = null;
    try {
      await exportService.exportAttendance({ includeExported: true });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.statusCode).toBe(413);
  });
});
