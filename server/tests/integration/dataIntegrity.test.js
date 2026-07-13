/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — data integrity hardening (audit PR 6)
 * ──────────────────────────────────────────────────────────
 * Covers:
 *   DATA-002 — one live (Ongoing) run per classCode
 *   DATA-005 — cancelSlot guard for past schedules
 *   DATA-007 — soft-deleted teams filtered from the live list
 *   DATA-013 — endTime > startTime guard on schedule create
 *
 * Wave K D2d (re-home, no Mongoose): every invariant is asserted through its
 * PG runtime enforcement instead of the Mongoose model layer that dies at D2e:
 *   • DATA-002 → the PG partial-unique index `uq_classes_code_ongoing`
 *     (migration 009, IN the CI chain) → a duplicate raises PG 23505, the twin
 *     of Mongo's E11000.
 *   • DATA-005 → the ported DELETE /api/schedules/:id cancel path (unchanged).
 *   • DATA-007 → the Mongo `Team.aggregate` soft-delete hook is replaced by the
 *     ported team-list repo: GET /api/teams filters `is_deleted = false`, and
 *     the "explicit override" is re-expressed as the trash route /api/teams/deleted.
 *   • DATA-013 → the endTime<=startTime rejection lives in the app layer
 *     (`scheduling-window-policy.assertValidBookingWindow`, ordering checked
 *     BEFORE the slot-window), reached via POST /api/schedules.
 * Fixtures are PG-native (`fx.*`); no `mongoose`/model require remains.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const {
  readActiveRow, findActiveRowWhere, updateActiveRow, deleteActiveRowsWhere,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

const rand = () => Math.random().toString(16).slice(2, 8).toUpperCase();

// ── DATA-002 ────────────────────────────────────────────────

describe('DATA-002 — Class Ongoing partial unique', () => {
  test('two Ongoing classes with same classCode fail with a unique violation', async () => {
    const code = `DI002-${rand()}`;
    await fx.createClass({ classCode: code, courseName: 'Foundation', totalSessions: 10, status: 'Ongoing' });

    let err = null;
    try {
      await fx.createClass({
        classCode: code,
        courseName: 'Communication 1',    // different courseName so the
        totalSessions: 10,                // {classCode,courseName} unique does
        status: 'Ongoing',               // NOT fire — only the Ongoing one does
      });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    // PG unique_violation (uq_classes_code_ongoing, mig 009) — the Mongo E11000 twin.
    expect(err.code).toBe('23505');
  });

  test('one Ongoing + one Completed for same classCode is allowed', async () => {
    const code = `DI002OK-${rand()}`;
    const first = await fx.createClass({ classCode: code, courseName: 'Foundation', totalSessions: 10, status: 'Ongoing' });
    // Promote to completed, then a new Ongoing slot opens up
    await updateActiveRow('Class', first._id, { status: 'Completed' });
    const second = await fx.createClass({
      classCode: code, courseName: 'Communication 1', totalSessions: 10, status: 'Ongoing',
    });
    expect(second._id).toBeTruthy();
  });
});

// ── DATA-005 ────────────────────────────────────────────────

describe('DATA-005 — cancelSlot refuses past schedules', () => {
  test('cancelling a schedule whose startTime is in the past returns 409 and preserves attendance', async () => {
    const past = new Date(Date.now() - 24 * 3600_000);
    const sch = await fx.createSchedule({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: past, endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
    });
    await fx.createAttendance({ scheduleId: sch._id, userId: seed.member1._id, status: 'P' });

    const res = await request(app)
      .delete(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already started|preserved/i);

    // Schedule and attendance both still exist
    expect(await readActiveRow('Schedule', sch._id)).not.toBeNull();
    expect(await findActiveRowWhere('Attendance', { scheduleId: sch._id })).not.toBeNull();

    // Cleanup
    await deleteActiveRowsWhere('Attendance', { scheduleId: sch._id });
    await deleteActiveRowsWhere('Schedule', { _id: sch._id });
  });

  test('cancelling a future schedule succeeds — durable flip, doc preserved', async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600_000);
    const sch = await fx.createSchedule({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: future, endTime: new Date(future.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
    });

    const res = await request(app)
      .delete(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(200);
    // Phase-04 slice A: the doc persists as cancelled history (never deleted).
    const after = await readActiveRow('Schedule', sch._id);
    expect(after).not.toBeNull();
    expect(after.status).toBe('cancelled');

    // Cleanup so later suites in this file see a clean slate.
    await deleteActiveRowsWhere('Schedule', { _id: sch._id });
  });
});

// ── DATA-007 ────────────────────────────────────────────────

describe('DATA-007 — team list filters soft-deleted', () => {
  const teamNames = async (path) => {
    const res = await request(app).get(path).set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    return res.body.data.map((t) => t.name);
  };

  test('a soft-deleted team is hidden from GET /api/teams but stays in /deleted (override)', async () => {
    const name = `SD-List-${rand()}`;
    const t = await fx.createTeam({
      name, classId: seed.class1._id, leaderId: seed.leader._id, members: [seed.leader._id],
    });

    expect(await teamNames('/api/teams')).toContain(name);

    await updateActiveRow('Team', t._id, { isDeleted: true, deletedAt: new Date() });

    // The live list now hides it (ported repo filters is_deleted = false)...
    expect(await teamNames('/api/teams')).not.toContain(name);
    // ...and the trash view still reaches it (the PG twin of the aggregate override).
    expect(await teamNames('/api/teams/deleted')).toContain(name);
  });
});

// ── DATA-013 ────────────────────────────────────────────────

describe('DATA-013 — schedule create rejects endTime <= startTime', () => {
  // POST /api/schedules → adminCreate → assertValidBookingSlot →
  // assertValidBookingWindow, which checks ordering BEFORE the slot-window match,
  // so a reversed/equal window fails on the ordering guard (400), not the slot check.
  const createAt = (startTime, endTime) =>
    request(app)
      .post('/api/schedules')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        classId: String(seed.class1._id),
        bookedTeamId: String(seed.team._id),
        startTime,
        endTime,
      });

  test('endTime < startTime is rejected on create', async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    const res = await createAt(start.toISOString(), new Date(start.getTime() - 60_000).toISOString());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/endTime must be after startTime/i);
  });

  test('endTime === startTime is rejected (strict inequality)', async () => {
    const start = new Date(Date.now() + 24 * 3600_000).toISOString();
    const res = await createAt(start, start);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/endTime must be after startTime/i);
  });
});
