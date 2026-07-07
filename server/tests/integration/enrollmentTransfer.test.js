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
const { readActiveRow, readActiveTeamMemberIds, findActiveRowWhere, countActiveRowsWhere, deleteActiveRowsWhere } = require('../pg-test-utils');

let app, tokens, seed, csrf;
let Enrollment, Team, Class, User, NotificationLog;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  Enrollment = require('../../models/Enrollment');
  Team = require('../../models/Team');
  Class = require('../../models/Class');
  User = require('../../models/User');
  NotificationLog = require('../../models/NotificationLog');
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

    // Source enrollment is now Transferred (active-backend read)
    const old = await readActiveRow('Enrollment', enrollment._id);
    expect(old.status).toBe('Transferred');
    expect(old.transferredTo.toString()).toBe(toTeam._id.toString());
    expect(old.leftAt).toBeTruthy();

    // Team members arrays updated (active-backend — Mongo embeds the members
    // array, Postgres stores the team_members junction).
    const fromMembers = await readActiveTeamMemberIds(fromTeam._id);
    const toMembers = await readActiveTeamMemberIds(toTeam._id);
    expect(fromMembers.map(m => m.toString())).not.toContain(seed.member1._id.toString());
    expect(toMembers.map(m => m.toString())).toContain(seed.member1._id.toString());
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

  // ── Unified ENROLLMENT_CREATED event on transfer (converge Phase 2) ──────────
  // Transfer now routes the target-team enrollment through the shared write spine
  // AND fires the unified event (cohort_enrolled bell + automation) — but ONLY
  // when the learner lands in a DIFFERENT cohort, so a same-cohort team rebalance
  // is never double-notified (it keeps the legacy transfer email only).

  test('transferring to a DIFFERENT cohort writes a cohort_enrolled bell for the learner', async () => {
    const { cls2, toTeam, enrollment } = await seedTransferScenario();
    // Clear any prior bells for this learner so the assertion is unambiguous.
    await deleteActiveRowsWhere('NotificationLog', { recipientUserId: seed.member1._id, type: 'cohort_enrolled' });

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString() });

    expect(res.status).toBe(200);

    // Same shape a direct cohort enrollee gets (one write spine + one event).
    const bell = await findActiveRowWhere('NotificationLog', {
      recipientUserId: seed.member1._id, type: 'cohort_enrolled',
    });
    expect(bell).toBeTruthy();
    expect(bell.channel).toBe('in_app');
    expect(bell.metadata.cohortId).toBe(cls2._id.toString());
  });

  test('transferring within the SAME cohort writes NO cohort_enrolled bell (email only)', async () => {
    counter += 1;
    const suffix = `${Date.now()}_same_${counter}`;
    // Two teams sharing ONE class — Team.classId is intentionally NOT unique
    // ("multiple teams per class allowed"), so a same-cohort rebalance is real.
    const cls = await Class.create({
      classCode: `XFER_SAME_${counter}`, courseName: 'Same Cohort', totalSessions: 10,
    });
    const mover = await User.create({
      empCode: `0955${String(counter).padStart(2, '0')}`,
      name: 'Same Mover', role: 'Participant', department: 'Test', password: 'pass12345678',
    });
    const fromTeam = await Team.create({
      name: `SameFrom-${suffix}`, classId: cls._id, leaderId: seed.leader._id,
      members: [seed.leader._id, mover._id],
    });
    const toTeam = await Team.create({
      name: `SameTo-${suffix}`, classId: cls._id, leaderId: seed.member2._id,
      members: [seed.member2._id],
    });
    const enrollment = await Enrollment.create({
      userId: mover._id, teamId: fromTeam._id, classId: cls._id, status: 'Active',
    });
    await deleteActiveRowsWhere('NotificationLog', { recipientUserId: mover._id });

    const res = await request(app)
      .post(`/api/enrollments/${enrollment._id}/transfer`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ toTeamId: toTeam._id.toString() });

    expect(res.status).toBe(200);
    // Same cohort → no redundant bell (the legacy transfer email still fires).
    const count = await countActiveRowsWhere('NotificationLog', {
      recipientUserId: mover._id, type: 'cohort_enrolled',
    });
    expect(count).toBe(0);
  });
});
