/**
 * ──────────────────────────────────────────────────────────
 * P2 Residual — Regression Tests
 * ──────────────────────────────────────────────────────────
 * Proves the 3 code fixes from commit 2db9073 hold.
 * If any fix is accidentally reverted, the relevant test
 * will fail before it reaches production.
 *
 * P2-08R: Export date range only marks records within
 *         schedule.startTime range as EXPORTED.
 * P2-03R: Single PUT /api/enrollments/:id with status Dropped
 *         removes user from future Schedule.enrolledUsers.
 * P2-05R: Production IMPORT_DEFAULT_PASSWORD guard — throws
 *         ServiceError(500); dev/test fallback still works.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(teardown);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Poll an Attendance row (active backend) until its syncStatus reaches the
 * expected value, up to ~2s. markExported runs AFTER the download stream has
 * ended (step 5 of the claim flow), so the HTTP 200 can resolve a beat before
 * the mark lands — that ordering is real production behaviour, not a bug.
 * The assertion itself stays strict: the caller still expects the final value.
 */
const waitForSyncStatus = async (attendanceId, expected, tries = 20) => {
  let row = null;
  for (let i = 0; i < tries; i += 1) {
    row = await readActiveRow('Attendance', attendanceId); // eslint-disable-line no-await-in-loop
    if (row && row.syncStatus === expected) return row;
    await new Promise((r) => setTimeout(r, 100)); // eslint-disable-line no-await-in-loop
  }
  return row;
};

/** Create a schedule + one PENDING attendance record for a given startTime. */
const seedAttendanceAt = async (startTime, userId, classId, teamId) => {
  const endTime = new Date(startTime.getTime() + 90 * 60_000);
  const schedule = await fx.createSchedule({
    classId,
    bookedTeamId: teamId,
    startTime,
    endTime,
    enrolledUsers: [userId],
  });
  const attendance = await fx.createAttendance({
    scheduleId: schedule._id,
    userId,
    status: 'P',
    syncStatus: 'PENDING',
  });
  return { schedule, attendance };
};

// ── P2-08R ───────────────────────────────────────────────────────────────────

describe('P2-08R — export date range only marks in-range records as EXPORTED', () => {
  test('record with schedule.startTime inside range → EXPORTED; outside → stays PENDING', async () => {
    const userId  = seed.member1._id;
    const classId = seed.class1._id;
    const teamId  = seed.team._id;

    // Inside the requested range (March 2024)
    const { attendance: attInside } = await seedAttendanceAt(
      new Date('2024-03-15T09:00:00Z'), userId, classId, teamId
    );
    // Outside the requested range (January 2024)
    const { attendance: attOutside } = await seedAttendanceAt(
      new Date('2024-01-10T09:00:00Z'), userId, classId, teamId
    );

    // Export March 2024 only
    const res = await request(app)
      .get('/api/export/attendance?from=2024-03-01&to=2024-03-31')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheet|octet-stream/);

    // Re-fetch both records from the ACTIVE backend (the export claim/mark now
    // writes through the dual-backend repository — a Mongoose read is stale on
    // the PG lane). Poll the in-range record: markExported lands post-stream.
    const inDb = await waitForSyncStatus(attInside._id, 'EXPORTED');
    const outDb = await readActiveRow('Attendance', attOutside._id);

    expect(inDb.syncStatus).toBe('EXPORTED');  // inside range: must be exported
    expect(outDb.syncStatus).toBe('PENDING');  // outside range: must be untouched
  });

  test('concurrent exports: one gets 200, the other 404 — record EXPORTED exactly once (P2R-01)', async () => {
    const userId  = seed.member2._id;
    const classId = seed.class1._id;
    const teamId  = seed.team._id;

    // One PENDING record in April 2024
    const { attendance } = await seedAttendanceAt(
      new Date('2024-04-10T09:00:00Z'), userId, classId, teamId
    );

    // Two concurrent export requests for the same window
    const [res1, res2] = await Promise.all([
      request(app)
        .get('/api/export/attendance?from=2024-04-01&to=2024-04-30')
        .set('Authorization', `Bearer ${tokens.admin}`),
      request(app)
        .get('/api/export/attendance?from=2024-04-01&to=2024-04-30')
        .set('Authorization', `Bearer ${tokens.admin}`),
    ]);

    // With P2R-01 fix: the loser claims 0 records (modifiedCount=0) and throws
    // ServiceError(404) instead of returning an empty Excel. So one gets 200,
    // the other gets 404 — never two 200s with a double-exported record.
    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 404]);

    // The record must be fully EXPORTED — not stuck in EXPORTING. Active-backend
    // read + poll (markExported lands after the winner's download stream ends).
    const inDb = await waitForSyncStatus(attendance._id, 'EXPORTED');
    expect(inDb.syncStatus).toBe('EXPORTED');
  });
});

// ── P2-03R ───────────────────────────────────────────────────────────────────

describe('P2-03R — single PUT Dropped removes user from future Schedule.enrolledUsers', () => {
  test('user is pulled from future schedules after single enrollment Dropped', async () => {
    const suffix = Date.now();

    // Fresh class + team + enrollment
    const cls = await fx.createClass({
      classCode: `R03_${suffix % 100000}`,   // max 20 chars: "R03_" (4) + 5 digits = 9 ✓
      courseName: 'P2-03R Regression',
      totalSessions: 5,
    });
    const team = await fx.createTeam({
      name: `R03_Team_${suffix % 100000}`,
      classId: cls._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id, seed.member1._id],
    });
    const enrollment = await fx.createEnrollment({
      userId: seed.member1._id,
      teamId: team._id,
      classId: cls._id,
      status: 'Active',
    });

    // Future schedule (7 days from now) with member1 enrolled
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const futureSchedule = await fx.createSchedule({
      classId: cls._id,
      bookedTeamId: team._id,
      startTime: futureStart,
      endTime: new Date(futureStart.getTime() + 90 * 60_000),
      enrolledUsers: [seed.member1._id],
    });

    // Confirm user is enrolled before the update (active backend — the
    // fixture write above is auto-mirrored into PG on the pg lane)
    const before = await readActiveRow('Schedule', futureSchedule._id);
    expect(before.enrolledUsers.map(String)).toContain(seed.member1._id.toString());

    // Single PUT → Dropped
    const res = await request(app)
      .put(`/api/enrollments/${enrollment._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Dropped' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Dropped');

    // User must have been pulled from the future schedule — read the ACTIVE
    // backend: the pull now rides the enrollment-status seam (B2-tail), so on
    // the pg lane the write lands in PG only and a Mongo read would be stale.
    const after = await readActiveRow('Schedule', futureSchedule._id);
    expect(after.enrolledUsers.map(String)).not.toContain(seed.member1._id.toString());
  });

  test('past schedules are NOT affected when enrollment is Dropped', async () => {
    const suffix = Date.now() + 1;

    const cls = await fx.createClass({
      classCode: `R03P_${suffix % 100000}`,  // max 20 chars: "R03P_" (5) + 5 digits = 10 ✓
      courseName: 'P2-03R Past Schedule',
      totalSessions: 5,
    });
    const team = await fx.createTeam({
      name: `R03P_Team_${suffix % 100000}`,
      classId: cls._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id, seed.member2._id],
    });
    const enrollment = await fx.createEnrollment({
      userId: seed.member2._id,
      teamId: team._id,
      classId: cls._id,
      status: 'Active',
    });

    // Past schedule (already ended — should be untouched)
    const pastStart = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const pastSchedule = await fx.createSchedule({
      classId: cls._id,
      bookedTeamId: team._id,
      startTime: pastStart,
      endTime: new Date(pastStart.getTime() + 90 * 60_000),
      enrolledUsers: [seed.member2._id],
    });

    const res = await request(app)
      .put(`/api/enrollments/${enrollment._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Dropped' });

    expect(res.status).toBe(200);

    // Past schedule's enrolledUsers must remain intact (attendance records
    // still valid) — active-backend read, same reason as P2-03R above.
    const pastAfter = await readActiveRow('Schedule', pastSchedule._id);
    expect(pastAfter.enrolledUsers.map(String)).toContain(seed.member2._id.toString());
  });
});

// ── P2-05R ───────────────────────────────────────────────────────────────────

describe('P2-05R — IMPORT_DEFAULT_PASSWORD production guard', () => {
  // Save original values so we can restore after each test
  let origNodeEnv;
  let origPwd;

  beforeEach(() => {
    origNodeEnv = process.env.NODE_ENV;
    origPwd     = process.env.IMPORT_DEFAULT_PASSWORD;
  });

  afterEach(() => {
    process.env.NODE_ENV = origNodeEnv;
    if (origPwd !== undefined) {
      process.env.IMPORT_DEFAULT_PASSWORD = origPwd;
    } else {
      delete process.env.IMPORT_DEFAULT_PASSWORD;
    }
  });

  // empCode max = 20 chars. Use short prefixes + 6-digit timestamp suffix.
  const shortTs = () => String(Date.now()).slice(-6);

  test('returns 500 in production when IMPORT_DEFAULT_PASSWORD is not set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.IMPORT_DEFAULT_PASSWORD;

    const res = await request(app)
      .post('/api/import/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        users: [{
          empCode: `P5P_${shortTs()}`,       // "P5P_" (4) + 6 = 10 chars ✓
          name: 'Prod Guard Test',
          role: 'Participant',
          email: `p5prod_${shortTs()}@test.com`,
        }],
      });

    // In production, handleError masks 500 messages → just verify the status.
    // The server log (pino) will contain the full "IMPORT_DEFAULT_PASSWORD" detail.
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('succeeds in test/dev when IMPORT_DEFAULT_PASSWORD is not set (fallback active)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.IMPORT_DEFAULT_PASSWORD;

    const res = await request(app)
      .post('/api/import/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        users: [{
          empCode: `P5D_${shortTs()}`,       // "P5D_" (4) + 6 = 10 chars ✓
          name: 'Dev Fallback Test',
          role: 'Participant',
          email: `p5dev_${shortTs()}@test.com`,
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // At least 1 user created or updated
    expect(res.body.data.created + res.body.data.updated).toBeGreaterThanOrEqual(1);
  });

  test('succeeds in production when IMPORT_DEFAULT_PASSWORD is explicitly set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.IMPORT_DEFAULT_PASSWORD = 'SomeSecureOrgPass!99';

    const res = await request(app)
      .post('/api/import/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        users: [{
          empCode: `P5OK_${shortTs()}`,      // "P5OK_" (5) + 6 = 11 chars ✓
          name: 'Prod With Env Test',
          role: 'Participant',
          email: `p5ok_${shortTs()}@test.com`,
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
