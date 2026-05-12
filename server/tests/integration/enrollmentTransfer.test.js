/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Enrollment Transfer Endpoint
 * POST /api/enrollments/:id/transfer
 * ──────────────────────────────────────────────────────────
 * Exercises the atomic transfer flow:
 *   - Source enrollment → Transferred + transferredTo + leftAt
 *   - Source Team.members → user pulled
 *   - Target Team.members → user pushed
 *   - New Active enrollment created in target team
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');

let app, tokens, seed, csrf;
let Enrollment, Team, Class;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  Enrollment = require('../../models/Enrollment');
  Team = require('../../models/Team');
  Class = require('../../models/Class');
});

afterAll(async () => {
  await teardown();
});

// Helper — seed a fresh pair of classes + teams + active enrollment.
// Each call uses unique classCodes so the Team.classId unique index is satisfied.
let counter = 0;
const seedTransferScenario = async () => {
  counter += 1;
  const suffix = `${Date.now()}_${counter}`;

  const cls1 = await Class.create({
    classCode: `XFER_FROM_${counter}`, courseName: 'Source Class', totalSessions: 10,
  });
  const cls2 = await Class.create({
    classCode: `XFER_TO_${counter}`, courseName: 'Target Class', totalSessions: 10,
  });

  const fromTeam = await Team.create({
    name: `Source-${suffix}`,
    classId: cls1._id,
    leaderId: seed.leader._id,
    members: [seed.leader._id, seed.member1._id],
  });

  const toTeam = await Team.create({
    name: `Target-${suffix}`,
    classId: cls2._id,
    leaderId: seed.member2._id,
    members: [seed.member2._id],
  });

  const enrollment = await Enrollment.create({
    userId: seed.member1._id,
    teamId: fromTeam._id,
    classId: cls1._id,
    status: 'Active',
  });

  return { cls1, cls2, fromTeam, toTeam, enrollment };
};

describe('POST /api/enrollments/:id/transfer', () => {
  test('transfers an Active enrollment and updates both teams atomically', async () => {
    const { fromTeam, toTeam, enrollment } = await seedTransferScenario();

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString(), note: 'Level adjustment' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('Active');
    expect(res.body.data.teamId._id.toString()).toBe(toTeam._id.toString());
    expect(res.body.data.note).toBe('Level adjustment');

    // Source enrollment is now Transferred
    const old = await Enrollment.findById(enrollment._id);
    expect(old.status).toBe('Transferred');
    expect(old.transferredTo.toString()).toBe(toTeam._id.toString());
    expect(old.leftAt).toBeTruthy();

    // Team members arrays updated
    const fromAfter = await Team.findById(fromTeam._id);
    const toAfter = await Team.findById(toTeam._id);
    expect(fromAfter.members.map(m => m.toString())).not.toContain(seed.member1._id.toString());
    expect(toAfter.members.map(m => m.toString())).toContain(seed.member1._id.toString());
  });

  test('returns 400 when toTeamId is missing', async () => {
    const { enrollment } = await seedTransferScenario();

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when source and target teams are the same', async () => {
    const { fromTeam, enrollment } = await seedTransferScenario();

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: fromTeam._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same/i);
  });

  test('returns 400 when source enrollment is not Active (e.g. already Transferred)', async () => {
    const { toTeam, enrollment } = await seedTransferScenario();

    // Manually mark Dropped
    await Enrollment.findByIdAndUpdate(enrollment._id, { status: 'Dropped', leftAt: new Date() });

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Active/);
  });

  test('returns 404 when enrollment does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/enrollments/${fakeId}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: seed.team._id.toString() });

    expect(res.status).toBe(404);
  });

  test('returns 404 when target team does not exist', async () => {
    const { enrollment } = await seedTransferScenario();
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: fakeId });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Target team/);
  });

  test('returns 409 when user is already in target team', async () => {
    const { toTeam, enrollment } = await seedTransferScenario();
    // Pre-add member1 to toTeam (so the transfer would create a duplicate)
    await Team.findByIdAndUpdate(toTeam._id, { $addToSet: { members: seed.member1._id } });

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString() });

    expect(res.status).toBe(409);
  });

  test('returns 401 without auth', async () => {
    const { toTeam, enrollment } = await seedTransferScenario();
    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString() });

    expect(res.status).toBe(401);
  });

  test('returns 403 when called by a non-Admin', async () => {
    const { toTeam, enrollment } = await seedTransferScenario();
    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString() });

    expect(res.status).toBe(403);
  });
});
