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
const LearningProgram = require('../../models/LearningProgram');

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

  // ── Audit PR T (API-002) — optional pagination + slim modes ─────────────

  test('GET /api/teams?page=1&limit=1 returns paginated shape', async () => {
    const res = await request(app)
      .get('/api/teams?page=1&limit=1')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('pages');
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('limit', 1);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  test('GET /api/teams?slim=true skips the members populate', async () => {
    const res = await request(app)
      .get('/api/teams?slim=true')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    // In slim mode `members` should remain as raw ObjectId strings, not
    // populated user documents. Each entry should be a 24-char hex id
    // (no `name`/`empCode` keys).
    const sample = res.body.data.find((t) => Array.isArray(t.members) && t.members.length > 0);
    if (sample) {
      const m = sample.members[0];
      // Populated would be an object with `name` etc; slim should be string.
      expect(typeof m === 'string' || !m.name).toBe(true);
    }
  });

  test('GET /api/teams (no query) keeps legacy shape (no `total`/`pages`)', async () => {
    const res = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
    expect(res.body).not.toHaveProperty('pages');
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

// ── GET /api/teams/my-teams — schedulingMode exposure (Phase 1) ──────────────
// The booking client gates cells by the program's schedulingMode (Pass C is
// enforced server-side at the bookSlot chokepoint). getMyTeams nested-populates
// classId.programId.schedulingMode so the grid can pre-empt the 403/400. A
// program-less class exposes no nested program; the client falls back to
// 'leader_booking'.

describe('GET /api/teams/my-teams — schedulingMode exposure', () => {
  test('program-less class returns 200 with classId but no nested program', async () => {
    const res = await request(app)
      .get('/api/teams/my-teams')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const alpha = res.body.data.find((t) => t.name === 'Alpha Team');
    expect(alpha).toBeDefined();
    expect(alpha.classId.classCode).toBe('TEST001');
    // class1 has no programId → nested program absent/null (client falls back).
    expect(alpha.classId.programId == null).toBe(true);
  });

  test('program-linked class exposes classId.programId.schedulingMode', async () => {
    const program = await LearningProgram.create({
      code: 'BKUITESTPROG', name: 'Booking UI Test Program',
      schedulingMode: 'admin_scheduled',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    try {
      const res = await request(app)
        .get('/api/teams/my-teams')
        .set('Authorization', `Bearer ${tokens.leader}`).set(csrf);

      expect(res.status).toBe(200);
      const alpha = res.body.data.find((t) => t.name === 'Alpha Team');
      expect(alpha).toBeDefined();
      expect(alpha.classId.programId).toBeDefined();
      expect(alpha.classId.programId.schedulingMode).toBe('admin_scheduled');
    } finally {
      // Revert so other tests / later files see class1 program-less again.
      await Class.findByIdAndUpdate(seed.class1._id, { programId: null });
      await LearningProgram.findByIdAndDelete(program._id);
    }
  });
});

// ── PUT /api/teams/:id — capacity guard on member add (Wave E2 / D5) ──────────
// Adding a member grows existing future sessions' rosters. That add must not
// push a session past its effective capacity (the 4th overflow path).

describe('PUT /api/teams/:id — capacity guard on member add', () => {
  test('adding a member that would overflow a future session is rejected (422); roster unchanged', async () => {
    const cls = await Class.create({ classCode: 'CAPADD001', courseName: 'Cap Add Class', totalSessions: 10 });
    const leader = await User.create({ empCode: '097001', name: 'Cap Leader', role: 'Participant', department: 'Test', password: 'pass12345678' });
    const m1 = await User.create({ empCode: '097002', name: 'Cap M1', role: 'Participant', department: 'Test', password: 'pass12345678' });
    const m2 = await User.create({ empCode: '097003', name: 'Cap M2', role: 'Participant', department: 'Test', password: 'pass12345678' });
    const team = await Team.create({ name: 'Cap Add Team', classId: cls._id, leaderId: leader._id, members: [leader._id, m1._id] });
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Session at capacity 2 with both current members enrolled.
    const sched = await Schedule.create({
      classId: cls._id, bookedTeamId: team._id,
      startTime: future, endTime: new Date(future.getTime() + 60 * 60 * 1000),
      enrolledUsers: [leader._id, m1._id], capacity: 2,
    });

    try {
      const res = await request(app)
        .put(`/api/teams/${team._id}`)
        .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
        .send({ members: [leader._id.toString(), m1._id.toString(), m2._id.toString()] });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/capacity/);
      // Transaction rolled back — the future session's roster is untouched.
      const after = await Schedule.findById(sched._id).lean();
      expect(after.enrolledUsers.length).toBe(2);
    } finally {
      await Schedule.findByIdAndDelete(sched._id);
      await Team.findByIdAndDelete(team._id);
      await Class.findByIdAndDelete(cls._id);
      await User.deleteMany({ _id: { $in: [leader._id, m1._id, m2._id] } });
    }
  });
});
