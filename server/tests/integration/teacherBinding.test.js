/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Class.teacherIds binding enforcement
 * (audit PR 5 — AUTHZ-001)
 * ──────────────────────────────────────────────────────────
 *
 * Verifies that once a class has a populated teacherIds list, only
 * those teachers (plus Admin) can write evaluations / list evaluations
 * for that class / mark attendance for schedules belonging to that class.
 *
 * Classes with empty teacherIds keep the legacy permissive behaviour —
 * this is the graceful-migration design (see policy/classBinding.js).
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await mongoose.disconnect();
});

// Helper — mint a token for any User._id (mirrors setup.js).
const tokenFor = (userId) =>
  jwt.sign({ id: String(userId) }, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('Class.teacherIds binding — evaluation', () => {
  const Class = require('../../models/Class');
  const User = require('../../models/User');

  let boundClass, unboundClass, teacherA, teacherB;

  beforeAll(async () => {
    // Create a second teacher so we have a known "bound vs unbound" pair.
    teacherA = await User.create({
      empCode: 'T-BIND-A',
      name: 'Teacher Bound A',
      role: 'Teacher',
      password: 'bound-a-pwd-12345',
    });
    teacherB = await User.create({
      empCode: 'T-BIND-B',
      name: 'Teacher Bound B',
      role: 'Teacher',
      password: 'bound-b-pwd-12345',
    });

    boundClass = await Class.create({
      classCode: 'BIND001',
      courseName: 'Bound Course Test',
      totalSessions: 5,
      teacherIds: [teacherA._id],
    });
    unboundClass = await Class.create({
      classCode: 'BIND002',
      courseName: 'Unbound Course Test',
      totalSessions: 5,
      // teacherIds left default ([]) — legacy / permissive
    });
  });

  test('Teacher A (bound) CAN upsert evaluation for boundClass → 200', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokenFor(teacherA._id)}`)
      .set(csrf)
      .send({
        classId: boundClass._id,
        userId: seed.member1._id,
        level: 'B1',
        grammarScore: 7,
        vocabularyScore: 7,
        pronunciationScore: 7,
        fluencyScore: 7,
        teacherComment: 'A can write to this class',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Teacher B (NOT bound) CANNOT upsert evaluation for boundClass → 403', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`)
      .set(csrf)
      .send({
        classId: boundClass._id,
        userId: seed.member2._id,
        level: 'B1',
        grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('teacher-not-bound-to-class');
  });

  test('Teacher B (NOT bound) CANNOT list evaluations for boundClass → 403', async () => {
    const res = await request(app)
      .get(`/api/evaluations?classId=${boundClass._id}`)
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`);

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('teacher-not-bound-to-class');
  });

  test('Teacher A (bound) CAN list evaluations for boundClass → 200', async () => {
    const res = await request(app)
      .get(`/api/evaluations?classId=${boundClass._id}`)
      .set('Authorization', `Bearer ${tokenFor(teacherA._id)}`);

    expect(res.status).toBe(200);
  });

  test('Any Teacher CAN upsert for unboundClass (empty teacherIds → graceful) → 200', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`)
      .set(csrf)
      .send({
        classId: unboundClass._id,
        userId: seed.member1._id,
        level: 'B1',
        grammarScore: 7, vocabularyScore: 7, pronunciationScore: 7, fluencyScore: 7,
      });
    expect(res.status).toBe(200);
  });

  test('Admin CAN upsert regardless of binding → 200', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        classId: boundClass._id,
        userId: seed.leader._id,
        level: 'B2',
        grammarScore: 8, vocabularyScore: 8, pronunciationScore: 8, fluencyScore: 8,
      });
    expect(res.status).toBe(200);
  });
});

describe('Class.teacherIds binding — attendance', () => {
  const Class = require('../../models/Class');
  const Schedule = require('../../models/Schedule');
  const User = require('../../models/User');

  let boundClass, unboundClass, teacherA, teacherB, schedBound, schedUnbound;

  beforeAll(async () => {
    teacherA = await User.create({
      empCode: 'T-BIND-ATT-A',
      name: 'Att Teacher A',
      role: 'Teacher',
      password: 'att-a-pwd-12345',
    });
    teacherB = await User.create({
      empCode: 'T-BIND-ATT-B',
      name: 'Att Teacher B',
      role: 'Teacher',
      password: 'att-b-pwd-12345',
    });

    boundClass = await Class.create({
      classCode: 'BIND-ATT-001',
      courseName: 'Bound Att Class',
      totalSessions: 5,
      teacherIds: [teacherA._id],
    });
    unboundClass = await Class.create({
      classCode: 'BIND-ATT-002',
      courseName: 'Unbound Att Class',
      totalSessions: 5,
    });

    // Past schedules so we can bulk-mark without hitting the future-guard.
    const past = new Date(Date.now() - 24 * 3600_000);
    const end  = new Date(past.getTime() + 90 * 60_000);
    schedBound = await Schedule.create({
      classId: boundClass._id,
      bookedTeamId: seed.team._id,
      startTime: past, endTime: end,
      enrolledUsers: [seed.member1._id, seed.member2._id],
    });
    schedUnbound = await Schedule.create({
      classId: unboundClass._id,
      bookedTeamId: seed.team._id,
      startTime: past, endTime: end,
      enrolledUsers: [seed.member1._id, seed.member2._id],
    });
  });

  test('Teacher A (bound) CAN bulk-mark schedule of boundClass → 200', async () => {
    const res = await request(app)
      .post(`/api/attendance/${schedBound._id}`)
      .set('Authorization', `Bearer ${tokenFor(teacherA._id)}`)
      .set(csrf)
      .send({ records: [
        { userId: seed.member1._id, status: 'P' },
        { userId: seed.member2._id, status: 'P' },
      ] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Teacher B (NOT bound) CANNOT bulk-mark schedule of boundClass → 403', async () => {
    const res = await request(app)
      .post(`/api/attendance/${schedBound._id}`)
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'A' }] });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('teacher-not-bound-to-class');
  });

  test('Teacher B (NOT bound) CANNOT read roster of boundClass schedule → 403', async () => {
    const res = await request(app)
      .get(`/api/attendance/schedule/${schedBound._id}`)
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`);

    expect(res.status).toBe(403);
  });

  test('Teacher A attendance calendar includes bound + unbound schedules → 200', async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokenFor(teacherA._id)}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id.toString());
    expect(ids).toContain(schedBound._id.toString());
    expect(ids).toContain(schedUnbound._id.toString());
  });

  test('Teacher B attendance calendar excludes another teacher bound schedule', async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id.toString());
    expect(ids).not.toContain(schedBound._id.toString());
    expect(ids).toContain(schedUnbound._id.toString());
  });

  test('Participant still cannot read attendance calendar → 403', async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
  });

  test('Any Teacher CAN bulk-mark schedule of unboundClass (graceful) → 200', async () => {
    const res = await request(app)
      .post(`/api/attendance/${schedUnbound._id}`)
      .set('Authorization', `Bearer ${tokenFor(teacherB._id)}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'P' }] });

    expect(res.status).toBe(200);
  });

  test('Admin CAN bulk-mark any schedule → 200', async () => {
    const res = await request(app)
      .post(`/api/attendance/${schedBound._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'L' }] });

    expect(res.status).toBe(200);
  });
});
