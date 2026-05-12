/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Attendance Flow
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  // CSRF required on POST/PUT/PATCH/DELETE (csrfProtection middleware).
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

// ── Mark Attendance ──────────────────────────────────────

describe('POST /api/attendance/:scheduleId (bulk mark)', () => {
  let pastSchedule;

  beforeAll(async () => {
    // Create a schedule in the past (attendance can be marked)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    pastDate.setHours(10, 0, 0, 0);
    const pastEnd = new Date(pastDate.getTime() + 5400000); // +1.5h

    pastSchedule = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: pastDate,
      endTime: pastEnd,
      enrolledUsers: [seed.leader._id, seed.member1._id],
    });
  });

  afterAll(async () => {
    await Schedule.deleteMany({});
    await Attendance.deleteMany({});
  });

  test('marks attendance for past schedule successfully', async () => {
    const res = await request(app)
      .post(`/api/attendance/${pastSchedule._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        records: [
          { userId: seed.leader._id.toString(), status: 'P' },
          { userId: seed.member1._id.toString(), status: 'A' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
  });

  test('rejects marking for future schedule', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureEnd = new Date(futureDate.getTime() + 5400000);

    const futureSchedule = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: futureDate,
      endTime: futureEnd,
      enrolledUsers: [seed.leader._id],
    });

    const res = await request(app)
      .post(`/api/attendance/${futureSchedule._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        records: [
          { userId: seed.leader._id.toString(), status: 'P' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/chưa|future/i);

    await Schedule.findByIdAndDelete(futureSchedule._id);
  });

  test('rejects invalid attendance status', async () => {
    const res = await request(app)
      .post(`/api/attendance/${pastSchedule._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        records: [
          { userId: seed.leader._id.toString(), status: 'INVALID' },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid|status/i);
  });

  test('rejects empty records array', async () => {
    const res = await request(app)
      .post(`/api/attendance/${pastSchedule._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ records: [] });

    expect(res.status).toBe(400);
  });

  test('rejects non-existent schedule', async () => {
    const fakeId = '000000000000000000000000';
    const res = await request(app)
      .post(`/api/attendance/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        records: [{ userId: seed.leader._id.toString(), status: 'P' }],
      });

    expect(res.status).toBe(404);
  });

  test('rejects userId not enrolled in schedule (BUG-02 fix)', async () => {
    // member2 is NOT in enrolledUsers of pastSchedule
    const res = await request(app)
      .post(`/api/attendance/${pastSchedule._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        records: [{ userId: seed.member2._id.toString(), status: 'P' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enrolled/i);
  });
});

// ── Analytics ────────────────────────────────────────────

describe('GET /api/attendance/analytics/*', () => {
  test('by-employee returns array', async () => {
    const res = await request(app)
      .get('/api/attendance/analytics/by-employee')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('by-team returns array with team structure', async () => {
    const res = await request(app)
      .get('/api/attendance/analytics/by-team')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('stats');
      expect(res.body.data[0]).toHaveProperty('memberCount');
    }
  });
});
