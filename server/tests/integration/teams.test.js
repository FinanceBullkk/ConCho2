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

// ── Cascade Delete ───────────────────────────────────────
// Note: MongoMemoryServer without replica set doesn't support
// transactions. We test the delete endpoint and verify cascading
// via the controller logic (which falls back gracefully).

describe('Team Delete', () => {
  // AUDIT PR 9 (QA-005): un-skipped. The skip reason ("MongoMemoryServer
  // runs as standalone") was wrong — setup.js:36 now uses
  // MongoMemoryReplSet, so transactions work in the test harness.
  // This test exercises the cascade-soft-delete path: closes active
  // enrollments and pulls members from future schedules.
  test('DELETE /api/teams/:id soft-deletes the team + closes Active enrollments', async () => {
    const Team = require('../../models/Team');
    const Enrollment = require('../../models/Enrollment');

    // Build a disposable team with a fresh leader + members so the global
    // seed (Alpha Team) is preserved for other suites.
    const User = require('../../models/User');
    const leaderForDel = await User.create({
      empCode: 'TD-LEAD-' + Math.random().toString(16).slice(2, 6),
      name: 'Disposable Leader', role: 'Participant', password: 'del-pwd-12345',
    });
    const memberForDel = await User.create({
      empCode: 'TD-MEM-' + Math.random().toString(16).slice(2, 6),
      name: 'Disposable Member', role: 'Participant', password: 'del-mem-12345',
    });
    const target = await Team.create({
      name: 'TeamToDelete-' + Math.random().toString(16).slice(2, 8),
      classId: seed.class1._id,
      leaderId: leaderForDel._id,
      members: [leaderForDel._id, memberForDel._id],
    });
    // Plant an Active enrollment for one member so we can verify the cascade.
    await Enrollment.create({
      userId: memberForDel._id, teamId: target._id, classId: seed.class1._id,
      status: 'Active', joinedAt: new Date(),
    });

    const res = await request(app)
      .delete(`/api/teams/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Team is soft-deleted, not removed.
    const stillThere = await Team.findOne({ _id: target._id, isDeleted: true });
    expect(stillThere).not.toBeNull();
    expect(stillThere.deletedAt).toBeTruthy();

    // Cascade: the Active enrollment is closed (status flips off Active).
    const enrolls = await Enrollment.find({ teamId: target._id });
    for (const e of enrolls) {
      expect(e.status).not.toBe('Active');
    }
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
