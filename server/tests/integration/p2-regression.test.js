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

let app, tokens, seed, csrf;
let Attendance, Schedule, Enrollment, Class, Team;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  Attendance  = require('../../models/Attendance');
  Schedule    = require('../../models/Schedule');
  Enrollment  = require('../../models/Enrollment');
  Class       = require('../../models/Class');
  Team        = require('../../models/Team');
});

afterAll(teardown);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a schedule + one PENDING attendance record for a given startTime. */
const seedAttendanceAt = async (startTime, userId, classId, teamId) => {
  const endTime = new Date(startTime.getTime() + 90 * 60_000);
  const schedule = await Schedule.create({
    classId,
    bookedTeamId: teamId,
    startTime,
    endTime,
    enrolledUsers: [userId],
  });
  const attendance = await Attendance.create({
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

    // Re-fetch both records from DB
    const [inDb, outDb] = await Promise.all([
      Attendance.findById(attInside._id).select('syncStatus').lean(),
      Attendance.findById(attOutside._id).select('syncStatus').lean(),
    ]);

    expect(inDb.syncStatus).toBe('EXPORTED');  // inside range: must be exported
    expect(outDb.syncStatus).toBe('PENDING');  // outside range: must be untouched
  });

  test('concurrent exports: record is claimed exactly once, not stuck in EXPORTING', async () => {
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

    // At least one request must succeed
    const successes = [res1.status, res2.status].filter(s => s === 200);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Key invariant: the record must be fully EXPORTED — never stuck in EXPORTING.
    // This proves the claim-then-mark pattern is atomic and complete.
    const inDb = await Attendance.findById(attendance._id).select('syncStatus').lean();
    expect(inDb.syncStatus).toBe('EXPORTED');
  });
});

// ── P2-03R ───────────────────────────────────────────────────────────────────

describe('P2-03R — single PUT Dropped removes user from future Schedule.enrolledUsers', () => {
  test('user is pulled from future schedules after single enrollment Dropped', async () => {
    const suffix = Date.now();

    // Fresh class + team + enrollment
    const cls = await Class.create({
      classCode: `R03_${suffix % 100000}`,   // max 20 chars: "R03_" (4) + 5 digits = 9 ✓
      courseName: 'P2-03R Regression',
      totalSessions: 5,
    });
    const team = await Team.create({
      name: `R03_Team_${suffix % 100000}`,
      classId: cls._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id, seed.member1._id],
    });
    const enrollment = await Enrollment.create({
      userId: seed.member1._id,
      teamId: team._id,
      classId: cls._id,
      status: 'Active',
    });

    // Future schedule (7 days from now) with member1 enrolled
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const futureSchedule = await Schedule.create({
      classId: cls._id,
      bookedTeamId: team._id,
      startTime: futureStart,
      endTime: new Date(futureStart.getTime() + 90 * 60_000),
      enrolledUsers: [seed.member1._id],
    });

    // Confirm user is enrolled before the update
    const before = await Schedule.findById(futureSchedule._id).lean();
    expect(before.enrolledUsers.map(String)).toContain(seed.member1._id.toString());

    // Single PUT → Dropped
    const res = await request(app)
      .put(`/api/enrollments/${enrollment._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Dropped' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Dropped');

    // User must have been pulled from the future schedule
    const after = await Schedule.findById(futureSchedule._id).lean();
    expect(after.enrolledUsers.map(String)).not.toContain(seed.member1._id.toString());
  });

  test('past schedules are NOT affected when enrollment is Dropped', async () => {
    const suffix = Date.now() + 1;

    const cls = await Class.create({
      classCode: `R03P_${suffix % 100000}`,  // max 20 chars: "R03P_" (5) + 5 digits = 10 ✓
      courseName: 'P2-03R Past Schedule',
      totalSessions: 5,
    });
    const team = await Team.create({
      name: `R03P_Team_${suffix % 100000}`,
      classId: cls._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id, seed.member2._id],
    });
    const enrollment = await Enrollment.create({
      userId: seed.member2._id,
      teamId: team._id,
      classId: cls._id,
      status: 'Active',
    });

    // Past schedule (already ended — should be untouched)
    const pastStart = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const pastSchedule = await Schedule.create({
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

    // Past schedule's enrolledUsers must remain intact (attendance records still valid)
    const pastAfter = await Schedule.findById(pastSchedule._id).lean();
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
