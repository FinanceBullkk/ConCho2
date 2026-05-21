/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Team CRUD & Guards
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const User = require('../../models/User');
const Class = require('../../models/Class');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  // CSRF required on POST/PUT/DELETE.
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

// ── Team CRUD ────────────────────────────────────────────

describe('Team CRUD', () => {
  test('GET /api/teams returns all teams', async () => {
    const res = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('POST /api/teams creates a new team', async () => {
    // Create a fresh class + fresh user to avoid conflicts
    const freshClass = await Class.create({
      classCode: 'FRESH001', courseName: 'Fresh Class', totalSessions: 10,
    });
    const freshUser = await User.create({
      empCode: '099001', name: 'Fresh Leader', role: 'Participant',
      department: 'Test', password: 'fresh12345',
    });

    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        name: 'Gamma Team',
        classId: freshClass._id.toString(),
        leaderId: freshUser._id.toString(),
        members: [freshUser._id.toString()],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Gamma Team');

    // Cleanup
    await Team.findByIdAndDelete(res.body.data._id);
    await Class.findByIdAndDelete(freshClass._id);
    await User.findByIdAndDelete(freshUser._id);
  });

  test('non-Admin cannot create team (403)', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({
        name: 'Rogue Team',
        leaderId: seed.leader._id.toString(),
        members: [],
      });

    expect(res.status).toBe(403);
  });

  test('rejects creating team with already-assigned classId (409)', async () => {
    // class1 is already assigned to Alpha Team
    const freshUser2 = await User.create({
      empCode: '099002', name: 'Another Leader', role: 'Participant',
      department: 'Test', password: 'another12345',
    });

    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        name: 'Conflict Team',
        classId: seed.class1._id.toString(),
        leaderId: freshUser2._id.toString(),
        members: [freshUser2._id.toString()],
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already assigned/);

    await User.findByIdAndDelete(freshUser2._id);
  });
});

// ── Fix 8: Team Delete — cancel future schedules ─────────

describe('Team Delete — future schedule cancellation', () => {
  let delCls, delLeader, delTeam, pastSched, futureSched;

  beforeEach(async () => {
    const suffix = Date.now();
    delCls = await Class.create({
      classCode: `DEL_${suffix}`, courseName: 'Delete Test', totalSessions: 5,
    });
    delLeader = await User.create({
      empCode: `DL${suffix}`, name: 'Del Leader', role: 'Participant',
      department: 'Test', password: 'del12345678',
    });
    delTeam = await Team.create({
      name: `DelTeam-${suffix}`, classId: delCls._id,
      leaderId: delLeader._id, members: [delLeader._id],
    });

    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    pastSched = await Schedule.create({
      classId: delCls._id, bookedTeamId: delTeam._id,
      startTime: past, endTime: new Date(past.getTime() + 90 * 60 * 1000),
      enrolledUsers: [delLeader._id],
    });
    futureSched = await Schedule.create({
      classId: delCls._id, bookedTeamId: delTeam._id,
      startTime: future, endTime: new Date(future.getTime() + 90 * 60 * 1000),
      enrolledUsers: [delLeader._id],
    });
  });

  afterEach(async () => {
    await Schedule.deleteMany({ _id: { $in: [pastSched._id, futureSched._id] } });
    await Class.findByIdAndDelete(delCls._id);
    await User.findByIdAndDelete(delLeader._id);
  });

  test('DELETE /api/teams/:id cancels future schedules and soft-deletes the team', async () => {
    const res = await request(app)
      .delete(`/api/teams/${delTeam._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cascade.cancelledSchedules).toBe(1);

    const futureCheck = await Schedule.findById(futureSched._id);
    expect(futureCheck).toBeNull();

    const pastCheck = await Schedule.findById(pastSched._id);
    expect(pastCheck).not.toBeNull();
  });

  test('non-Admin cannot delete a team (403)', async () => {
    const res = await request(app)
      .delete(`/api/teams/${delTeam._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf);

    expect(res.status).toBe(403);
  });
});

// ── Leader Guard ─────────────────────────────────────────

describe('User Delete Guard (Team Leader)', () => {
  test('cannot delete a user who is a team leader', async () => {
    const res = await request(app)
      .delete(`/api/users/${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    // Should be blocked because seed.leader is Alpha Team's leader
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/leader/i);
  });
});
