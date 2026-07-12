/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — session waitlist + FIFO auto-promotion
 * (Wave E3 phase-04, slice B)
 * ──────────────────────────────────────────────────────────
 * Join is self-service and ONLY for FULL sessions (owner decision: free
 * seats → 409). A freed seat (capacity raise / member removal / Dropped
 * auto-release) promotes the oldest waiter INSIDE the freeing transaction;
 * cancelling the session dissolves the queue (entries → 'cancelled').
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const {
  readActiveRow, findActiveRowWhere, countActiveRowsWhere,
  deleteActiveRowsWhere, updateActiveRow,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;
const sign = (id) => jwt.sign({ id: id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  tokens.member1 = sign(seed.member1._id);
  tokens.member2 = sign(seed.member2._id);
});

afterAll(async () => {
  await teardown();
});

// Far-future direct creates (slot policy applies only to booking APIs).
let hourCursor = 0;
const futureRange = (days = 60) => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + days + Math.floor(hourCursor / 12));
  start.setUTCHours(3 + (hourCursor % 12), 0, 0, 0);
  hourCursor += 1;
  return { start, end: new Date(start.getTime() + 60 * 60_000) };
};

// A team-less cohort session: roster `enrolled`, capacity `capacity`.
const makeCohortSession = async ({ capacity = 1, enrolled = [] }) => {
  const { start, end } = futureRange();
  return fx.createSchedule({
    classId: seed.class2._id, bookedTeamId: null,
    startTime: start, endTime: end, capacity, enrolledUsers: enrolled,
  });
};

const enrollInCohort = (userId) =>
  fx.createEnrollment({
    userId, classId: seed.class2._id, teamId: null, status: 'Active',
  });

const joinAs = (token, scheduleId) =>
  request(app).post(`/api/schedules/${scheduleId}/waitlist`)
    .set('Authorization', `Bearer ${token}`).set(csrf);

beforeEach(async () => {
  await deleteActiveRowsWhere('WaitlistEntry', {});
  await deleteActiveRowsWhere('Enrollment', { classId: seed.class2._id });
});

describe('Waitlist — join policy', () => {
  test('cohort-enrolled learner joins a FULL session → 201 with FIFO position', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });

    const res = await joinAs(tokens.member1, sch._id);
    expect(res.status).toBe(201);
    expect(res.body.data.position).toBe(1);
    expect(res.body.data.status).toBe('waiting');
  });

  test('free seats → 409 (waitlist is only for full sessions)', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 2, enrolled: [seed.member2._id] });

    const res = await joinAs(tokens.member1, sch._id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/free seats/i);
  });

  test('not in the session audience (no cohort enrollment, not team member) → 403', async () => {
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });
    const res = await joinAs(tokens.member1, sch._id);
    expect(res.status).toBe(403);
  });

  test('already enrolled in the session → 409', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member1._id] });
    const res = await joinAs(tokens.member1, sch._id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already enrolled/i);
  });

  test('started session → 409', async () => {
    await enrollInCohort(seed.member1._id);
    const past = new Date(Date.now() - 60 * 60_000);
    const sch = await fx.createSchedule({
      classId: seed.class2._id, bookedTeamId: null,
      startTime: past, endTime: new Date(past.getTime() + 60 * 60_000),
      capacity: 1, enrolledUsers: [seed.member2._id],
    });
    const res = await joinAs(tokens.member1, sch._id);
    expect(res.status).toBe(409);
  });

  test('concurrent double-join → exactly one 201, one 409 (partial-unique race guard)', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });

    const [a, b] = await Promise.all([
      joinAs(tokens.member1, sch._id),
      joinAs(tokens.member1, sch._id),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await countActiveRowsWhere('WaitlistEntry', {
      scheduleId: sch._id, userId: seed.member1._id, status: 'waiting',
    })).toBe(1);
  });
});

describe('Waitlist — leave / mine / staff list', () => {
  test('leave withdraws my entry; a second leave → 404', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });
    await joinAs(tokens.member1, sch._id);

    const res = await request(app).delete(`/api/schedules/${sch._id}/waitlist`)
      .set('Authorization', `Bearer ${tokens.member1}`).set(csrf);
    expect(res.status).toBe(200);
    const entry = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member1._id });
    expect(entry.status).toBe('withdrawn');

    const again = await request(app).delete(`/api/schedules/${sch._id}/waitlist`)
      .set('Authorization', `Bearer ${tokens.member1}`).set(csrf);
    expect(again.status).toBe(404);
  });

  test('mine lists my live entries with position', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });
    await joinAs(tokens.member1, sch._id);

    const res = await request(app).get('/api/schedules/waitlist/mine')
      .set('Authorization', `Bearer ${tokens.member1}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].position).toBe(1);
    expect(String(res.body.data[0].scheduleId._id)).toBe(String(sch._id));
  });

  test('staff list: Participant → 403; Admin sees the queue with positions', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });
    await joinAs(tokens.member1, sch._id);

    const deny = await request(app).get(`/api/schedules/${sch._id}/waitlist`)
      .set('Authorization', `Bearer ${tokens.member1}`);
    expect(deny.status).toBe(403);

    const ok = await request(app).get(`/api/schedules/${sch._id}/waitlist`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toHaveLength(1);
    expect(ok.body.data[0].position).toBe(1);
    expect(ok.body.data[0].userId.empCode).toBe(seed.member1.empCode);
  });

  test('staff list: Coordinator reads any session queue (Wave E polish)', async () => {
    const coordinator = await fx.createUser({
      empCode: '000088', name: 'Coord Waitlist', role: 'Coordinator',
      department: 'HR', password: 'coord12345',
    });
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });
    await joinAs(tokens.member1, sch._id);

    const res = await request(app).get(`/api/schedules/${sch._id}/waitlist`)
      .set('Authorization', `Bearer ${sign(coordinator._id)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].position).toBe(1);
  });
});

describe('Waitlist — queue dissolves with the session', () => {
  test('admin cancel flips waiting entries to cancelled', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });
    await joinAs(tokens.member1, sch._id);

    const res = await request(app).delete(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    expect(res.status).toBe(200);

    const entry = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member1._id });
    expect(entry.status).toBe('cancelled');
    expect((await readActiveRow('Schedule', sch._id)).status).toBe('cancelled');
  });
});

describe('Waitlist — FIFO auto-promotion', () => {
  test('capacity raise promotes the OLDEST waiter in-tx + writes a NotificationLog', async () => {
    await enrollInCohort(seed.member1._id);
    await enrollInCohort(seed.leader._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });

    expect((await joinAs(tokens.member1, sch._id)).status).toBe(201); // first in line
    expect((await joinAs(tokens.leader, sch._id)).status).toBe(201);  // second

    const res = await request(app).put(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ capacity: 2 });
    expect(res.status).toBe(200);

    const after = await readActiveRow('Schedule', sch._id);
    expect(after.enrolledUsers.map(String)).toContain(String(seed.member1._id)); // FIFO winner
    expect(after.enrolledUsers.map(String)).not.toContain(String(seed.leader._id));
    expect(after.enrolledUsers.length).toBe(2); // never above cap

    const first = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member1._id });
    const second = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.leader._id });
    expect(first.status).toBe('promoted');
    expect(first.promotedAt).toBeInstanceOf(Date);
    expect(second.status).toBe('waiting');

    // Active-backend read (#256): the promotion log now writes through the
    // dual-backend waitlist repo — a Mongoose read is stale on the PG lane.
    const log = await findActiveRowWhere('NotificationLog', {
      type: 'waitlist_promoted', learnerId: seed.member1._id,
      cadenceKey: `${sch._id}:${seed.member1._id}`,
    });
    expect(log).not.toBeNull();
  });

  test('Dropped auto-release frees a seat and promotes the waiter', async () => {
    // Dedicated dropper so other tests keep member2 Active.
    const dropper = await fx.createUser({
      empCode: '000077', name: 'Dropper', role: 'Participant',
      department: 'Sales', password: 'dropper12345',
    });
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [dropper._id] });
    expect((await joinAs(tokens.member1, sch._id)).status).toBe(201);

    // Drive the status→Dropped auto-release through the production seam (the
    // admin user-update API → the ported user-mutations repo's roster-sync),
    // not the retired Mongoose post-findOneAndUpdate hook.
    const dropped = await request(app).put(`/api/users/${dropper._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ status: 'Dropped' });
    expect(dropped.status).toBe(200);

    const after = await readActiveRow('Schedule', sch._id);
    expect(after).not.toBeNull(); // not emptied — the promotion refilled it
    expect(after.enrolledUsers.map(String)).toEqual([String(seed.member1._id)]);
    const entry = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member1._id });
    expect(entry.status).toBe('promoted');
  });

  test('team member removal (team-sync) frees a seat and promotes a waiting teammate', async () => {
    // Team session: roster [leader, member1] at cap 2 (full); member2 (teammate) waits.
    const { start, end } = futureRange();
    const sch = await fx.createSchedule({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end, capacity: 2,
      enrolledUsers: [seed.leader._id, seed.member1._id],
    });
    expect((await joinAs(tokens.member2, sch._id)).status).toBe(201);

    // Remove member1 from the team — sync pulls them from the roster.
    const res = await request(app).put(`/api/teams/${seed.team._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ members: [seed.leader._id.toString(), seed.member2._id.toString()] });
    expect(res.status).toBe(200);

    const after = await readActiveRow('Schedule', sch._id);
    expect(after.enrolledUsers.map(String).sort()).toEqual(
      [String(seed.leader._id), String(seed.member2._id)].sort(),
    );
    const entry = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member2._id });
    expect(entry.status).toBe('promoted');

    // Restore team membership for any later suites in this file's DB.
    await request(app).put(`/api/teams/${seed.team._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ members: [seed.leader._id.toString(), seed.member1._id.toString(), seed.member2._id.toString()] });
  });
});

describe('Waitlist — learner session visibility (phase-04 widening)', () => {
  test('a cohort-enrolled learner sees the cohort session they are NOT rostered on (+effectiveCapacity)', async () => {
    await enrollInCohort(seed.member1._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });

    const res = await request(app).get('/api/learning/sessions?limit=2000')
      .set('Authorization', `Bearer ${tokens.member1}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((s) => String(s._id) === String(sch._id));
    expect(row).toBeDefined();
    expect(row.effectiveCapacity).toBe(1);
    expect(row.enrolledLearnerCount).toBe(1);
  });

  test('a team member NOT on the full team session roster still sees it (F4) and can join its waitlist', async () => {
    const { start, end } = futureRange();
    const sch = await fx.createSchedule({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end, capacity: 1,
      enrolledUsers: [seed.member1._id], // member2's add was capacity-blocked
    });

    const res = await request(app).get('/api/learning/sessions?limit=2000')
      .set('Authorization', `Bearer ${tokens.member2}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((s) => String(s._id) === String(sch._id));
    expect(row).toBeDefined();
    expect(row.effectiveCapacity).toBe(1);
    expect(row.enrolledLearnerCount).toBe(1);

    // ...so they can actually reach the join the policy already allows.
    expect((await joinAs(tokens.member2, sch._id)).status).toBe(201);
  });
});

describe('Waitlist — review regressions (2026-06-11)', () => {
  test('a stale queue head (already seated by another path) cannot clog promotion (F1)', async () => {
    await enrollInCohort(seed.member1._id);
    await enrollInCohort(seed.leader._id);
    const sch = await makeCohortSession({ capacity: 1, enrolled: [seed.member2._id] });

    expect((await joinAs(tokens.member1, sch._id)).status).toBe(201); // queue head
    expect((await joinAs(tokens.leader, sch._id)).status).toBe(201);  // behind

    // Drift: a legacy/manual path seats member1 WITHOUT resolving their queue
    // row — the head is now stale ('waiting' but already on the roster).
    await updateActiveRow('Schedule', sch._id, { enrolledUsers: [seed.member1._id.toString()] });

    // Raise capacity by 1 → exactly one real free seat.
    const res = await request(app).put(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ capacity: 2 });
    expect(res.status).toBe(200);

    const after = await readActiveRow('Schedule', sch._id);
    expect(after.enrolledUsers.map(String).sort()).toEqual(
      [String(seed.member1._id), String(seed.leader._id)].sort(),
    );
    expect(after.enrolledUsers.length).toBe(2); // never above cap

    // Stale head resolved in place — no seat consumed, no promotion email...
    const head = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member1._id });
    expect(head.status).toBe('promoted');
    expect(await findActiveRowWhere('NotificationLog', {
      type: 'waitlist_promoted', cadenceKey: `${sch._id}:${seed.member1._id}`,
    })).toBeNull();
    // ...and the waiter BEHIND it got the freed seat + the email.
    const second = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.leader._id });
    expect(second.status).toBe('promoted');
    expect(await findActiveRowWhere('NotificationLog', {
      type: 'waitlist_promoted', cadenceKey: `${sch._id}:${seed.leader._id}`,
    })).not.toBeNull();
  });

  test('team REASSIGN dissolves the old audience queue — no cross-team promotion later (F2)', async () => {
    const team2 = await fx.createTeam({
      name: 'PIC Review B', classId: seed.class1._id,
      leaderId: seed.leader._id, members: [seed.leader._id],
    });
    const { start, end } = futureRange();
    const sch = await fx.createSchedule({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end, capacity: 1,
      enrolledUsers: [seed.member1._id],
    });
    // member2 (old-team member) waits on the full session.
    expect((await joinAs(tokens.member2, sch._id)).status).toBe(201);

    const res = await request(app).put(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ bookedTeamId: team2._id.toString() });
    expect(res.status).toBe(200);

    // Roster rebuilt to the NEW team; the old-team waiter is dissolved.
    const after = await readActiveRow('Schedule', sch._id);
    expect(after.enrolledUsers.map(String)).toEqual([String(seed.leader._id)]);
    const entry = await findActiveRowWhere('WaitlistEntry', { scheduleId: sch._id, userId: seed.member2._id });
    expect(entry.status).toBe('cancelled');

    // A later capacity raise must promote NOBODY from the dissolved queue.
    const raise = await request(app).put(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ capacity: 3 });
    expect(raise.status).toBe(200);
    const roster = (await readActiveRow('Schedule', sch._id)).enrolledUsers.map(String);
    expect(roster).not.toContain(String(seed.member2._id));
  });
});
