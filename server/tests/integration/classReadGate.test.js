/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — GET /api/classes/:id Participant gate (PR M / AUTHZ-004)
 * ──────────────────────────────────────────────────────────
 * Before AUTHZ-004 every Participant could read any class by id. This
 * suite locks the new behaviour:
 *   - Admin    → 200 on any class
 *   - Teacher  → 200 on any class (graceful-migration: no teacherIds bound)
 *   - Participant
 *       enrolled        → 200
 *       not enrolled    → 404 (404, not 403, to avoid existence leak)
 *
 * The 404 vs 403 choice is on purpose — the participant should not be
 * able to distinguish "class does not exist" from "class exists but I'm
 * not in it". Same pattern Gmail uses for forbidden Drive files.
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');

let app, tokens, seed;
let Class, Team, Enrollment, User;
let jwt;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  Class = require('../../models/Class');
  Team = require('../../models/Team');
  Enrollment = require('../../models/Enrollment');
  User = require('../../models/User');
  jwt = require('jsonwebtoken');
});

afterAll(async () => {
  await teardown();
});

const sign = (userId) =>
  jwt.sign({ id: userId.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

// ── helpers ─────────────────────────────────────────────────────────────
let classCounter = 0;
const makeClass = async () => {
  classCounter += 1;
  return Class.create({
    classCode: `READ_GATE_${Date.now()}_${classCounter}`,
    courseName: 'Read-Gate Test',
    totalSessions: 8,
  });
};

const makeTeamWithMember = async (classId, userId, leaderId) => {
  const team = await Team.create({
    name: `Team-${Date.now()}-${classCounter}`,
    classId,
    leaderId: leaderId || userId,
    members: [userId],
  });
  await Enrollment.create({
    userId,
    teamId: team._id,
    classId,
    status: 'Active',
  });
  return team;
};

describe('GET /api/classes/:id — per-role read gate (AUTHZ-004)', () => {
  test('Admin can read any class', async () => {
    const cls = await makeClass();
    const r = await request(app)
      .get(`/api/classes/${cls._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.data.classCode).toBe(cls.classCode);
  });

  test('Teacher can read any class (graceful-migration — no teacherIds bound)', async () => {
    const cls = await makeClass();
    const r = await request(app)
      .get(`/api/classes/${cls._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(r.status).toBe(200);
  });

  test('Participant enrolled in the class can read it', async () => {
    const cls = await makeClass();
    // member1 already exists in seed; enroll them via a fresh team.
    await makeTeamWithMember(cls._id, seed.member1._id, seed.leader._id);

    const memberToken = sign(seed.member1._id);
    const r = await request(app)
      .get(`/api/classes/${cls._id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(r.status).toBe(200);
    expect(r.body.data.classCode).toBe(cls.classCode);
  });

  test('Participant NOT enrolled gets 404 (not 403) — existence not leaked', async () => {
    const cls = await makeClass();
    // member2 is a Participant but has no enrollment in this class.
    const stranger = sign(seed.member2._id);
    const r = await request(app)
      .get(`/api/classes/${cls._id}`)
      .set('Authorization', `Bearer ${stranger}`);
    expect(r.status).toBe(404);
    expect(r.body.success).toBe(false);
  });

  test('Participant requesting a nonexistent class id also gets 404 (uniform response)', async () => {
    // Use a random valid ObjectId that does not exist.
    const mongoose = require('mongoose');
    const fakeId = new mongoose.Types.ObjectId().toString();

    const stranger = sign(seed.member2._id);
    const r = await request(app)
      .get(`/api/classes/${fakeId}`)
      .set('Authorization', `Bearer ${stranger}`);
    expect(r.status).toBe(404);
  });
});
