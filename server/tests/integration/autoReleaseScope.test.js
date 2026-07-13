/**
 * ──────────────────────────────────────────────────────────
 * Regression Test — User auto-release scope (BUG #1)
 * ──────────────────────────────────────────────────────────
 * Before the fix, dropping a user triggered a global
 *   Schedule.deleteMany({ enrolledUsers: { $size: 0 } })
 * that nuked EVERY future empty schedule — including admin
 * pre-created placeholders belonging to other teams.
 *
 * This test seeds an admin placeholder (empty future schedule)
 * unrelated to the user being dropped, and verifies the placeholder
 * survives the cascade.
 *
 * Wave K D2d (re-home, no Mongoose): the drop is driven through the REAL
 * PG user-mutation path — `PUT /api/users/:id` status→Dropped →
 * `controllers/user/user-mutations-repository.pg.updateById` →
 * `domains/schedule/roster-sync.releaseUserFromFutureSchedules` (awaited
 * inline, so the cascade is complete when the response returns). Fixtures are
 * PG-native (`fx.*`); the old suite fired the Mongoose `post('findOneAndUpdate')`
 * hook directly, which vanishes once `mongoose` is dropped (D2e).
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

test('BUG #1 fix: dropping a user does NOT delete empty schedules of other teams', async () => {
  // ── Setup ─────────────────────────────────────────────
  // Class A + Team A with two participants.
  // Class B with a *placeholder* empty schedule (no enrolledUsers) —
  // an admin pre-created this slot for a future team that hasn't formed yet.
  const tag = `${Date.now()}`;
  const classA = await fx.createClass({
    classCode: `ARS_A_${tag}`, courseName: 'Class A', totalSessions: 10,
  });
  const classB = await fx.createClass({
    classCode: `ARS_B_${tag}`, courseName: 'Class B (placeholder)', totalSessions: 10,
  });

  const userToDrop = await fx.createUser({
    empCode: `ARS_${tag}_drop`, name: 'To Drop', email: `${tag}drop@x.com`,
    role: 'Participant', password: 'pass12345678',
  });

  const teamA = await fx.createTeam({
    name: `ARS_TeamA_${tag}`, classId: classA._id,
    leaderId: seed.leader._id,
    members: [seed.leader._id, userToDrop._id],
  });

  const inFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(inFuture.getTime() + 90 * 60 * 1000);

  // Schedule for class A that the user is enrolled in
  const schedA = await fx.createSchedule({
    classId: classA._id, bookedTeamId: teamA._id,
    startTime: inFuture, endTime: end,
    enrolledUsers: [userToDrop._id],
  });

  // Admin placeholder — EMPTY future schedule for class B, unrelated team.
  const placeholderTeam = await fx.createTeam({
    name: `ARS_PlaceholderTeam_${tag}`, classId: classB._id,
    leaderId: seed.member2._id, members: [seed.member2._id],
  });
  const futureB = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const endB = new Date(futureB.getTime() + 90 * 60 * 1000);
  const placeholder = await fx.createSchedule({
    classId: classB._id, bookedTeamId: placeholderTeam._id,
    startTime: futureB, endTime: endB,
    enrolledUsers: [], // intentionally empty placeholder
  });

  // ── Action: trigger the auto-release path via status → Dropped, through
  // the real user-mutation route. The PG repo awaits the roster-sync side
  // effect inline, so the cascade has run by the time the response returns.
  const res = await request(app)
    .put(`/api/users/${userToDrop._id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .set(csrf)
    .send({ status: 'Dropped' });
  expect(res.status).toBe(200);

  // ── Assertions ────────────────────────────────────────
  // schedA: user pulled, then schedA is empty, then schedA gets swept —
  // because schedA WAS in the affected set.
  const schedAAfter = await readActiveRow('Schedule', schedA._id);
  expect(schedAAfter).toBeNull();

  // placeholder: was not in the affected set (user never enrolled there) →
  // MUST survive the cascade. This is the regression check.
  const placeholderAfter = await readActiveRow('Schedule', placeholder._id);
  expect(placeholderAfter).not.toBeNull();
  expect(placeholderAfter._id.toString()).toBe(placeholder._id.toString());
});
