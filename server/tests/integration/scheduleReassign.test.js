/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Schedule Reassignment (Fix 4)
 * PUT /api/schedules/:id with bookedTeamId change
 * ──────────────────────────────────────────────────────────
 * When an admin reassigns a schedule to a new team the
 * enrolledUsers list must be rebuilt from the new team's
 * active members. Additional guards:
 *   - Block when attendance records already exist
 *   - Block when target team belongs to a different class
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');

let app, tokens, seed, csrf;
let Schedule, Team, Class, User, Attendance;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  Schedule = require('../../models/Schedule');
  Team = require('../../models/Team');
  Class = require('../../models/Class');
  User = require('../../models/User');
  Attendance = require('../../models/Attendance');
});

afterAll(async () => {
  await teardown();
});

let ctr = 0;
// Use counter only — Date.now() gets sliced away by .slice(0,10) on empCodes,
// causing duplicate key errors when multiple fixtures run in the same millisecond.
const uniq = () => String(++ctr).padStart(8, '0');

const setupReassignFixture = async () => {
  const sfx = uniq();

  const cls = await Class.create({
    classCode: `REAS_${sfx}`, courseName: 'Reassign Test', totalSessions: 10,
  });

  const leaderA = await User.create({
    empCode: `LA${sfx}`.slice(0, 10), name: `LeaderA-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });
  const memberA = await User.create({
    empCode: `MA${sfx}`.slice(0, 10), name: `MemberA-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });
  const leaderB = await User.create({
    empCode: `LB${sfx}`.slice(0, 10), name: `LeaderB-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });
  const memberB = await User.create({
    empCode: `MB${sfx}`.slice(0, 10), name: `MemberB-${sfx}`,
    role: 'Participant', department: 'Sales', password: 'pass12345678',
  });

  const teamA = await Team.create({
    name: `TeamA-${sfx}`, classId: cls._id,
    leaderId: leaderA._id, members: [leaderA._id, memberA._id],
  });
  const teamB = await Team.create({
    name: `TeamB-${sfx}`, classId: cls._id,
    leaderId: leaderB._id, members: [leaderB._id, memberB._id],
  });

  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const sched = await Schedule.create({
    classId: cls._id, bookedTeamId: teamA._id,
    startTime: future, endTime: new Date(future.getTime() + 90 * 60 * 1000),
    enrolledUsers: [leaderA._id, memberA._id],
  });

  return { cls, leaderA, memberA, leaderB, memberB, teamA, teamB, sched };
};

// ── Successful reassignment ──────────────────────────────

describe('Schedule reassignment — roster rebuild', () => {
  test('reassigning to a new team rebuilds enrolledUsers from that team', async () => {
    const { leaderB, memberB, teamB, sched } = await setupReassignFixture();

    const res = await request(app)
      .put(`/api/schedules/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ bookedTeamId: teamB._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await Schedule.findById(sched._id).lean();
    const enrolledIds = (updated.enrolledUsers || []).map(id => id.toString());

    expect(enrolledIds).toContain(leaderB._id.toString());
    expect(enrolledIds).toContain(memberB._id.toString());
  });

  test('old team members are not in enrolledUsers after reassignment', async () => {
    const { leaderA, memberA, teamB, sched } = await setupReassignFixture();

    await request(app)
      .put(`/api/schedules/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ bookedTeamId: teamB._id.toString() });

    const updated = await Schedule.findById(sched._id).lean();
    const enrolledIds = (updated.enrolledUsers || []).map(id => id.toString());

    expect(enrolledIds).not.toContain(leaderA._id.toString());
    expect(enrolledIds).not.toContain(memberA._id.toString());
  });

  test('a Dropped member of the target team is NOT enrolled after reassignment', async () => {
    const sfx = uniq();
    const cls = await Class.create({
      classCode: `REASD_${sfx}`, courseName: 'Reassign Active-only', totalSessions: 10,
    });
    const leaderD = await User.create({
      empCode: `RLD${sfx}`.slice(0, 10), name: `RLeaderD-${sfx}`,
      role: 'Participant', department: 'Sales', password: 'pass12345678',
    });
    const activeD = await User.create({
      empCode: `RAD${sfx}`.slice(0, 10), name: `RActiveD-${sfx}`,
      role: 'Participant', department: 'Sales', password: 'pass12345678',
    });
    const droppedD = await User.create({
      empCode: `RDD${sfx}`.slice(0, 10), name: `RDroppedD-${sfx}`,
      role: 'Participant', department: 'Sales', password: 'pass12345678', status: 'Dropped',
    });
    const teamSrc = await Team.create({
      name: `SrcD-${sfx}`, classId: cls._id, leaderId: leaderD._id, members: [leaderD._id],
    });
    const teamDst = await Team.create({
      name: `DstD-${sfx}`, classId: cls._id, leaderId: leaderD._id,
      members: [leaderD._id, activeD._id, droppedD._id],
    });
    const future = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const sched = await Schedule.create({
      classId: cls._id, bookedTeamId: teamSrc._id,
      startTime: future, endTime: new Date(future.getTime() + 60 * 60 * 1000),
      enrolledUsers: [leaderD._id],
    });

    const res = await request(app)
      .put(`/api/schedules/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ bookedTeamId: teamDst._id.toString() });

    expect(res.status).toBe(200);

    const updated = await Schedule.findById(sched._id).lean();
    const enrolledIds = (updated.enrolledUsers || []).map(id => id.toString());

    expect(enrolledIds).toContain(leaderD._id.toString());
    expect(enrolledIds).toContain(activeD._id.toString());
    expect(enrolledIds).not.toContain(droppedD._id.toString());
  });
});

// ── Guards ───────────────────────────────────────────────

describe('Schedule reassignment — attendance block', () => {
  test('returns 409 when attendance records already exist for the schedule', async () => {
    const { leaderA, teamB, sched } = await setupReassignFixture();

    await Attendance.create({
      scheduleId: sched._id, userId: leaderA._id, status: 'P',
    });

    const res = await request(app)
      .put(`/api/schedules/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ bookedTeamId: teamB._id.toString() });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/attendance/i);

    await Attendance.deleteMany({ scheduleId: sched._id });
  });
});

describe('Schedule reassignment — cross-class guard', () => {
  test('returns 400 when target team belongs to a different class', async () => {
    const { sched } = await setupReassignFixture();

    const otherCls = await Class.create({
      classCode: `OTHER_${uniq()}`, courseName: 'Other Class', totalSessions: 5,
    });
    const otherLeader = await User.create({
      empCode: `OL${uniq()}`.slice(0, 10), name: 'Other Leader',
      role: 'Participant', department: 'HR', password: 'pass12345678',
    });
    const otherTeam = await Team.create({
      name: `OtherTeam-${uniq()}`, classId: otherCls._id,
      leaderId: otherLeader._id, members: [otherLeader._id],
    });

    const res = await request(app)
      .put(`/api/schedules/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ bookedTeamId: otherTeam._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/class/i);

    await Team.findByIdAndDelete(otherTeam._id);
    await Class.findByIdAndDelete(otherCls._id);
    await User.findByIdAndDelete(otherLeader._id);
  });
});

// ── Wave E1: Admin time-move must respect ALLOWED_TIME_SLOTS ──
// Before E1 the Admin update path only checked end > start, so a session could
// be moved to an arbitrary off-policy time. The shared scheduling-window policy
// now validates the target window like the create/booking paths.
describe('Schedule update — off-policy time move is rejected', () => {
  test('returns 400 when moving a session to a non-configured slot', async () => {
    const { sched } = await setupReassignFixture();

    // 23:00 UTC = 06:00 VN — guaranteed outside every test ALLOWED_TIME_SLOTS.
    const target = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    target.setUTCHours(23, 0, 0, 0);
    const end = new Date(target.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .put(`/api/schedules/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ startTime: target.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/không hợp lệ/);
  });
});
