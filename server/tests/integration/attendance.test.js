/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Attendance Flow
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { deleteActiveRowsWhere, updateActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

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

    pastSchedule = await fx.createSchedule({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: pastDate,
      endTime: pastEnd,
      enrolledUsers: [seed.leader._id, seed.member1._id],
    });
  });

  afterAll(async () => {
    await deleteActiveRowsWhere('Schedule', {});
    await deleteActiveRowsWhere('Attendance', {});
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

    const futureSchedule = await fx.createSchedule({
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
    expect(res.body.message).toMatch(/future/i);

    await deleteActiveRowsWhere('Schedule', { _id: futureSchedule._id });
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

// ── SEC-014 (audit 2026-06-11): malformed :id → 400, never a CastError 500 ──

describe('SEC-014 — malformed ObjectId params answer 400', () => {
  test('GET /api/attendance/schedule/:scheduleId with garbage id → 400', async () => {
    const res = await request(app)
      .get('/api/attendance/schedule/not-an-object-id')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
  });

  test('GET /api/attendance/user/:userId with garbage id → 400', async () => {
    const res = await request(app)
      .get('/api/attendance/user/not-an-object-id')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
  });
});

// ── facilitatorPolicy.assignmentRequired enforcement (phase 3 deferral closed) ──
// A program that requires a facilitator cannot have its sessions run (attendance
// marked) until a trainer is assigned. Enforced at the marking chokepoint.

describe('Attendance — facilitator assignment requirement', () => {
  let program, cls, schedule;

  const pastSlot = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(10, 0, 0, 0);
    return { start: d, end: new Date(d.getTime() + 5400000) };
  };

  beforeEach(async () => {
    program = await fx.createLearningProgram({
      code: 'FACREQ', name: 'Facilitator Required Program',
      schedulingMode: 'admin_scheduled',
      facilitatorPolicy: { assignmentRequired: true },
    });
    cls = await fx.createClass({
      classCode: 'FACREQCLS', courseName: 'Facilitator Class', totalSessions: 1,
      programId: program._id, teacherIds: [],
    });
    const { start, end } = pastSlot();
    schedule = await fx.createSchedule({
      classId: cls._id, startTime: start, endTime: end,
      enrolledUsers: [seed.member1._id],
    });
  });

  afterEach(async () => {
    await deleteActiveRowsWhere('Schedule', {});
    await deleteActiveRowsWhere('Attendance', {});
    await deleteActiveRowsWhere('Class', { classCode: 'FACREQCLS' });
    await deleteActiveRowsWhere('LearningProgram', { code: 'FACREQ' });
  });

  const mark = () =>
    request(app)
      .post(`/api/attendance/${schedule._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ records: [{ userId: seed.member1._id.toString(), status: 'P' }] });

  test('blocks marking (422) when the required facilitator is not assigned', async () => {
    const res = await mark();
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/facilitator/i);
  });

  test('allows marking once a session instructor is assigned', async () => {
    await updateActiveRow('Schedule', schedule._id, { sessionInstructorIds: [seed.teacher._id.toString()] });
    const res = await mark();
    expect(res.status).toBe(200);
  });

  test('a cohort-bound teacher satisfies the requirement', async () => {
    await updateActiveRow('Class', cls._id, { teacherIds: [seed.teacher._id.toString()] });
    const res = await mark();
    expect(res.status).toBe(200);
  });

  test('no enforcement when the program does not require a facilitator', async () => {
    await updateActiveRow('LearningProgram', program._id, {
      facilitatorPolicy: { assignmentRequired: false },
    });
    const res = await mark();
    expect(res.status).toBe(200);
  });
});
