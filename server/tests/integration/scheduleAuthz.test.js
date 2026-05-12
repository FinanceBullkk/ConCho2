/**
 * ──────────────────────────────────────────────────────────
 * Regression Tests — Schedule Route Authorization (BUG #2)
 * GET  /api/schedules
 * GET  /api/schedules/:id
 * ──────────────────────────────────────────────────────────
 * Before this fix, both endpoints were gated only by `protect`,
 * so any authenticated Participant could list every schedule
 * org-wide and fetch arbitrary detail records (IDOR).
 *
 * These tests pin the scoped behavior:
 *   - Admin / Teacher: unrestricted
 *   - Participant: only schedules they are enrolled in
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');

let app, tokens, seed;
let Schedule;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  Schedule = require('../../models/Schedule');
});

afterAll(async () => {
  await teardown();
});

// Seed two future schedules:
//   sched1 — enrolledUsers=[member1]  (leader is NOT in it)
//   sched2 — enrolledUsers=[leader, member2]
let sched1, sched2;

beforeAll(async () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(future.getTime() + 90 * 60 * 1000);

  sched1 = await Schedule.create({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime: future,
    endTime: end,
    enrolledUsers: [seed.member1._id],
  });

  const future2 = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  const end2 = new Date(future2.getTime() + 90 * 60 * 1000);
  sched2 = await Schedule.create({
    classId: seed.class2._id,
    bookedTeamId: seed.team._id,
    startTime: future2,
    endTime: end2,
    enrolledUsers: [seed.leader._id, seed.member2._id],
  });
});

// ── GET /api/schedules ───────────────────────────────────

describe('GET /api/schedules — Participant scoping', () => {
  test('Admin sees all schedules', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toEqual(expect.arrayContaining([sched1._id.toString(), sched2._id.toString()]));
  });

  test('Teacher sees all schedules (no Participant filter)', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toEqual(expect.arrayContaining([sched1._id.toString(), sched2._id.toString()]));
  });

  test('Participant ONLY sees schedules where they are enrolled', async () => {
    // tokens.leader belongs to the leader user.
    // leader is in sched2 only.
    const res = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(sched2._id.toString());
    expect(ids).not.toContain(sched1._id.toString());
  });
});

// ── GET /api/schedules/:id ───────────────────────────────

describe('GET /api/schedules/:id — Participant IDOR guard', () => {
  test('Admin can fetch any schedule by id', async () => {
    const res = await request(app)
      .get(`/api/schedules/${sched1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(sched1._id.toString());
  });

  test('Teacher can fetch any schedule by id', async () => {
    const res = await request(app)
      .get(`/api/schedules/${sched1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
  });

  test('Participant fetching a schedule they are enrolled in: 200', async () => {
    const res = await request(app)
      .get(`/api/schedules/${sched2._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(sched2._id.toString());
  });

  test('Participant fetching a schedule they are NOT enrolled in: 403', async () => {
    const res = await request(app)
      .get(`/api/schedules/${sched1._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/schedules/${sched1._id}`);
    expect(res.status).toBe(401);
  });
});
