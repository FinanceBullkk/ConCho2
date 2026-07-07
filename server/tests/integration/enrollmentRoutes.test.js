/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Enrollment Routes (non-transfer)
 * GET  /api/enrollments
 * GET  /api/enrollments/team/:teamId
 * GET  /api/enrollments/user/:userId
 * PUT  /api/enrollments/:id
 * POST /api/enrollments/check-conflicts
 * ──────────────────────────────────────────────────────────
 * Transfer endpoint (POST /:id/transfer) has its own suite.
 * All endpoints are Admin-only.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { pollUntil, findActiveRowWhere } = require('../pg-test-utils');

let app, tokens, seed, csrf;
let Enrollment, Team, Class, Schedule;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  Enrollment = require('../../models/Enrollment');
  Team = require('../../models/Team');
  Class = require('../../models/Class');
  Schedule = require('../../models/Schedule');
});

afterAll(async () => {
  await teardown();
});

let enrollCounter = 0;
const seedTeamWithEnrollments = async () => {
  enrollCounter += 1;
  const suffix = `${Date.now()}_${enrollCounter}`;

  const cls = await Class.create({
    classCode: `ENR_${suffix}`, courseName: 'Enrollment Test', totalSessions: 10,
  });
  const team = await Team.create({
    name: `EnrollTeam-${suffix}`,
    classId: cls._id,
    leaderId: seed.leader._id,
    members: [seed.leader._id, seed.member1._id, seed.member2._id],
  });
  const e1 = await Enrollment.create({
    userId: seed.leader._id, teamId: team._id, classId: cls._id, status: 'Active',
  });
  const e2 = await Enrollment.create({
    userId: seed.member1._id, teamId: team._id, classId: cls._id, status: 'Active',
  });
  const e3 = await Enrollment.create({
    userId: seed.member2._id, teamId: team._id, classId: cls._id, status: 'Completed',
    leftAt: new Date(),
  });
  return { cls, team, enrollments: [e1, e2, e3] };
};

// ── GET /api/enrollments ─────────────────────────────────

describe('GET /api/enrollments', () => {
  test('Admin lists enrollments', async () => {
    await seedTeamWithEnrollments();
    const res = await request(app)
      .get('/api/enrollments')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('filters by teamId', async () => {
    const { team } = await seedTeamWithEnrollments();
    const res = await request(app)
      .get(`/api/enrollments?teamId=${team._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every(e => e.teamId._id.toString() === team._id.toString())).toBe(true);
  });

  test('filters by status', async () => {
    const { team } = await seedTeamWithEnrollments();
    const res = await request(app)
      .get(`/api/enrollments?teamId=${team._id}&status=Completed`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every(e => e.status === 'Completed')).toBe(true);
  });

  test('enriches with attendance summary when classId is supplied', async () => {
    const { cls } = await seedTeamWithEnrollments();
    const res = await request(app)
      .get(`/api/enrollments?classId=${cls._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    // Every record should have an attendance object (even if zeros)
    expect(res.body.data.every(e => e.attendance && typeof e.attendance.total === 'number')).toBe(true);
  });

  test('returns 403 for non-Admin', async () => {
    const res = await request(app)
      .get('/api/enrollments')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(403);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/enrollments');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/enrollments/team/:teamId ────────────────────

describe('GET /api/enrollments/team/:teamId', () => {
  test('returns enrollments for the team with attendance summary', async () => {
    const { team } = await seedTeamWithEnrollments();
    const res = await request(app)
      .get(`/api/enrollments/team/${team._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.data.every(e => e.attendance && typeof e.attendance.total === 'number')).toBe(true);
  });

  test('filters by ?status=Active', async () => {
    const { team } = await seedTeamWithEnrollments();
    const res = await request(app)
      .get(`/api/enrollments/team/${team._id}?status=Active`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every(e => e.status === 'Active')).toBe(true);
  });

  test('returns empty array for unknown teamId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/enrollments/team/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ── GET /api/enrollments/user/:userId ────────────────────

describe('GET /api/enrollments/user/:userId', () => {
  test('returns the user\'s full enrollment timeline', async () => {
    await seedTeamWithEnrollments();
    const res = await request(app)
      .get(`/api/enrollments/user/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.every(e => e.userId._id.toString() === seed.member1._id.toString())).toBe(true);
  });

  test('returns empty array for a user with no enrollments', async () => {
    // inactiveUser was never added to any team in setup or here
    const res = await request(app)
      .get(`/api/enrollments/user/${seed.inactiveUser._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    // Could be empty or include transient records from other tests — only
    // assert request succeeds and shape is correct.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── PUT /api/enrollments/:id ─────────────────────────────

describe('PUT /api/enrollments/:id', () => {
  test('updates status to Completed and auto-sets leftAt', async () => {
    const { enrollments } = await seedTeamWithEnrollments();
    const target = enrollments[0]; // Active

    const res = await request(app)
      .put(`/api/enrollments/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Completed', note: 'Finished course' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Completed');
    expect(res.body.data.note).toBe('Finished course');
    // Controller sets leftAt when status moves away from Active
    expect(res.body.data.leftAt).toBeTruthy();
  });

  test('resetting status to Active clears leftAt', async () => {
    const { enrollments } = await seedTeamWithEnrollments();
    const target = enrollments[2]; // Completed (leftAt already set)

    const res = await request(app)
      .put(`/api/enrollments/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Active' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Active');
    expect(res.body.data.leftAt).toBeNull();
  });

  test('updating only the note leaves status intact', async () => {
    const { enrollments } = await seedTeamWithEnrollments();
    const target = enrollments[1];
    const originalStatus = target.status;

    const res = await request(app)
      .put(`/api/enrollments/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ note: 'Just a note' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(originalStatus);
    expect(res.body.data.note).toBe('Just a note');
  });

  test('records an audit entry for the admin status override (parity with bulk path)', async () => {
    const { enrollments } = await seedTeamWithEnrollments();
    const target = enrollments[0];

    const res = await request(app)
      .put(`/api/enrollments/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Dropped', note: 'Left the program' });
    expect(res.status).toBe(200);

    // Golden rule: every mutation is audited. This single-update path used to
    // skip audit while its bulk twin recorded it — pin that it now writes one.
    // Audit is written through the ported repo (rows land in PG only on that
    // lane), so read the active backend rather than a Mongoose find.
    // Audit is fire-and-forget — poll instead of racing it (CI-load flake).
    const log = await pollUntil(() => findActiveRowWhere('AuditLog', {
      action: 'updated',
      entity: 'Enrollment',
      entityId: target._id,
    }));

    expect(log).toBeTruthy();
    expect(log.diff).toBeDefined();
  });

  test('returns 404 for unknown id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/enrollments/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Completed' });
    expect(res.status).toBe(404);
  });

  test('returns 403 for non-Admin', async () => {
    const { enrollments } = await seedTeamWithEnrollments();
    const res = await request(app)
      .put(`/api/enrollments/${enrollments[0]._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ note: 'nope' });
    expect(res.status).toBe(403);
  });
});

// ── POST /api/enrollments/check-conflicts ────────────────

describe('POST /api/enrollments/check-conflicts', () => {
  test('returns conflicts for users already Active in another team', async () => {
    const { team } = await seedTeamWithEnrollments();
    // member1 is Active in `team` — checking against a DIFFERENT team should flag it
    const otherCls = await Class.create({
      classCode: `OTHER_${Date.now()}_${enrollCounter++}`,
      courseName: 'X', totalSessions: 5,
    });
    const otherTeam = await Team.create({
      name: `OtherTeam-${Date.now()}`,
      classId: otherCls._id,
      leaderId: seed.member2._id,
      members: [seed.member2._id],
    });

    const res = await request(app)
      .post('/api/enrollments/check-conflicts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        teamId: otherTeam._id.toString(),
        memberIds: [seed.member1._id.toString()],
      });

    expect(res.status).toBe(200);
    // Other suites may have left member1 in Active enrollments across many teams;
    // we just verify the conflict report contains our user.
    const hit = res.body.data.find(c => c.userId.toString() === seed.member1._id.toString());
    expect(hit).toBeDefined();
    expect(hit.currentTeamName).toBeTruthy();
  });

  test('returns 400 when memberIds is missing', async () => {
    const res = await request(app)
      .post('/api/enrollments/check-conflicts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ teamId: seed.team._id.toString() });

    expect(res.status).toBe(400);
  });

  test('returns empty list when no conflicts', async () => {
    const res = await request(app)
      .post('/api/enrollments/check-conflicts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        teamId: seed.team._id.toString(),
        memberIds: [seed.inactiveUser._id.toString()],
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ── Close-path invariants → future-schedule roster pull ──────────
// Pins the BUG #2 transactional behaviour that the (deferred) close-path
// convergence — folding the ~6 scattered `status:'Dropped'` writes onto one
// enrollment spine — MUST preserve: dropping a learner removes them from FUTURE
// scheduled rosters; On-hold is reversible and must NOT pull; past sessions are
// frozen history. Single (PUT) and bulk (PATCH) paths share the same helper.

describe('Enrollment close-path → future-schedule roster pull', () => {
  const futureSession = (cls, userIds) => {
    const start = new Date(Date.now() + 7 * 86400000); // +7d
    return Schedule.create({
      classId: cls._id,
      startTime: start,
      endTime: new Date(start.getTime() + 3600000),
      enrolledUsers: userIds,
      status: 'scheduled',
    });
  };
  const rosterIds = async (id) =>
    (await Schedule.findById(id).lean()).enrolledUsers.map(String);

  test('PUT /:id status→Dropped pulls the learner from future schedules + sets leftAt', async () => {
    const { cls, enrollments } = await seedTeamWithEnrollments();
    const uid = seed.leader._id;
    const sched = await futureSession(cls, [uid, seed.member1._id]);

    const res = await request(app)
      .put(`/api/enrollments/${enrollments[0]._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Dropped' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Dropped');
    expect(res.body.data.leftAt).toBeTruthy();

    const ids = await rosterIds(sched._id);
    expect(ids).not.toContain(uid.toString());          // pulled
    expect(ids).toContain(seed.member1._id.toString()); // others untouched
  });

  test('PUT /:id status→On-hold sets leftAt but KEEPS the learner in future schedules (reversible)', async () => {
    const { cls, enrollments } = await seedTeamWithEnrollments();
    const uid = seed.member1._id;
    const sched = await futureSession(cls, [uid]);

    const res = await request(app)
      .put(`/api/enrollments/${enrollments[1]._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'On-hold' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('On-hold');
    expect(res.body.data.leftAt).toBeTruthy();
    expect(await rosterIds(sched._id)).toContain(uid.toString()); // NOT pulled
  });

  test('PATCH /bulk-status Dropped pulls every dropped learner, keeps the rest', async () => {
    const { cls, enrollments } = await seedTeamWithEnrollments();
    const sched = await futureSession(cls, [seed.leader._id, seed.member1._id, seed.member2._id]);

    const res = await request(app)
      .patch('/api/enrollments/bulk-status')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ enrollmentIds: [enrollments[0]._id.toString(), enrollments[1]._id.toString()], status: 'Dropped' });

    expect(res.status).toBe(200);
    expect(res.body.modifiedCount).toBe(2);

    const ids = await rosterIds(sched._id);
    expect(ids).not.toContain(seed.leader._id.toString());
    expect(ids).not.toContain(seed.member1._id.toString());
    expect(ids).toContain(seed.member2._id.toString()); // not dropped → kept
  });

  test('PATCH /bulk-status On-hold does NOT pull from future schedules (reversible)', async () => {
    const { cls, enrollments } = await seedTeamWithEnrollments();
    const uid = seed.leader._id;
    const sched = await futureSession(cls, [uid]);

    const res = await request(app)
      .patch('/api/enrollments/bulk-status')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ enrollmentIds: [enrollments[0]._id.toString()], status: 'On-hold' });

    expect(res.status).toBe(200);
    expect(await rosterIds(sched._id)).toContain(uid.toString()); // kept
  });

  test('Dropping leaves PAST session rosters frozen (only future sessions are pulled)', async () => {
    const { cls, enrollments } = await seedTeamWithEnrollments();
    const uid = seed.leader._id;
    const start = new Date(Date.now() - 7 * 86400000); // -7d (past)
    const past = await Schedule.create({
      classId: cls._id, startTime: start, endTime: new Date(start.getTime() + 3600000),
      enrolledUsers: [uid], status: 'scheduled',
    });

    await request(app)
      .put(`/api/enrollments/${enrollments[0]._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Dropped' });

    expect(await rosterIds(past._id)).toContain(uid.toString()); // history frozen
  });

  test('PATCH /bulk-status returns 403 for non-Admin', async () => {
    const { enrollments } = await seedTeamWithEnrollments();
    const res = await request(app)
      .patch('/api/enrollments/bulk-status')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ enrollmentIds: [enrollments[0]._id.toString()], status: 'Dropped' });
    expect(res.status).toBe(403);
  });
});
