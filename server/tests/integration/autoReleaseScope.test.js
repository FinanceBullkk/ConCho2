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
 * ──────────────────────────────────────────────────────────
 */

const { getApp, getSeedData, teardown } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');

let seed;
let User, Schedule, Class, Team;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
  User = require('../../models/User');
  Schedule = require('../../models/Schedule');
  Class = require('../../models/Class');
  Team = require('../../models/Team');
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
  const classA = await Class.create({
    classCode: `ARS_A_${tag}`, courseName: 'Class A', totalSessions: 10,
  });
  const classB = await Class.create({
    classCode: `ARS_B_${tag}`, courseName: 'Class B (placeholder)', totalSessions: 10,
  });

  const userToDrop = await User.create({
    empCode: `ARS_${tag}_drop`, name: 'To Drop', email: `${tag}drop@x.com`,
    role: 'Participant', password: 'pass12345678',
  });

  const teamA = await Team.create({
    name: `ARS_TeamA_${tag}`, classId: classA._id,
    leaderId: seed.leader._id,
    members: [seed.leader._id, userToDrop._id],
  });

  const inFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(inFuture.getTime() + 90 * 60 * 1000);

  // Schedule for class A that the user is enrolled in
  const schedA = await Schedule.create({
    classId: classA._id, bookedTeamId: teamA._id,
    startTime: inFuture, endTime: end,
    enrolledUsers: [userToDrop._id],
  });

  // Admin placeholder — EMPTY future schedule for class B, unrelated team.
  const placeholderTeam = await Team.create({
    name: `ARS_PlaceholderTeam_${tag}`, classId: classB._id,
    leaderId: seed.member2._id, members: [seed.member2._id],
  });
  const futureB = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const endB = new Date(futureB.getTime() + 90 * 60 * 1000);
  const placeholder = await Schedule.create({
    classId: classB._id, bookedTeamId: placeholderTeam._id,
    startTime: futureB, endTime: endB,
    enrolledUsers: [], // intentionally empty placeholder
  });

  // ── Action: trigger the auto-release path via status → Dropped
  await User.findOneAndUpdate(
    { _id: userToDrop._id },
    { $set: { status: 'Dropped' } },
    { new: true, runValidators: true }
  );

  // The post-hook is async. Give it a moment to commit.
  // (The transaction inside post-findOneAndUpdate awaits before resolving.)
  await new Promise((r) => setTimeout(r, 200));

  // ── Assertions ────────────────────────────────────────
  // schedA: user pulled, then schedA is empty, then schedA gets deleted —
  // because schedA WAS in the affected set.
  const schedAAfter = await readActiveRow('Schedule', schedA._id);
  expect(schedAAfter).toBeNull();

  // placeholder: was not in the affected set (user never enrolled there) →
  // MUST survive the cascade. This is the regression check.
  const placeholderAfter = await readActiveRow('Schedule', placeholder._id);
  expect(placeholderAfter).not.toBeNull();
  expect(placeholderAfter._id.toString()).toBe(placeholder._id.toString());
});
