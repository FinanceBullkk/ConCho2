/**
 * ──────────────────────────────────────────────────────────
 * Schedule read/query use-cases (domains/schedule/queries)
 * ──────────────────────────────────────────────────────────
 * Phase 1 modular-monolith refactor extracted the pure read paths
 * (getAvailability / listSchedules / getById / getMyClassSchedules /
 * getAttendanceCalendar) and the session-order cache out of the legacy
 * scheduleService into domains/schedule/. These tests pin the two derived
 * outputs the extraction owns — through the real routes — so the move stays
 * behaviour-preserving:
 *   1. sessionNumber attachment (session-order cache + numbering)
 *   2. getAttendanceCalendar status mapping (none/pending/partial/done)
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');

let app, tokens, seed;
let Schedule, Attendance;

// class1 (sessionNumber test) schedules
let s1a, s1b;
// class2 (attendance-calendar status test) schedules
let cNone, cPending, cPartial, cDone;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  Schedule = require('../../models/Schedule');
  Attendance = require('../../models/Attendance');

  const dayMs = 24 * 60 * 60 * 1000;
  const at = (days) => {
    const start = new Date(Date.now() + days * dayMs);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    return { startTime: start, endTime: end };
  };

  // ── class1: two ordered sessions for sessionNumber assertion ──
  s1a = await Schedule.create({
    classId: seed.class1._id, bookedTeamId: seed.team._id,
    ...at(3), enrolledUsers: [seed.member1._id],
  });
  s1b = await Schedule.create({
    classId: seed.class1._id, bookedTeamId: seed.team._id,
    ...at(5), enrolledUsers: [seed.member1._id],
  });

  // ── class2: four sessions covering every attendance status ──
  cNone = await Schedule.create({
    classId: seed.class2._id, bookedTeamId: seed.team._id,
    ...at(6), enrolledUsers: [],
  });
  cPending = await Schedule.create({
    classId: seed.class2._id, bookedTeamId: seed.team._id,
    ...at(7), enrolledUsers: [seed.member1._id, seed.member2._id],
  });
  cPartial = await Schedule.create({
    classId: seed.class2._id, bookedTeamId: seed.team._id,
    ...at(8), enrolledUsers: [seed.member1._id, seed.member2._id],
  });
  cDone = await Schedule.create({
    classId: seed.class2._id, bookedTeamId: seed.team._id,
    ...at(9), enrolledUsers: [seed.member1._id],
  });

  // Mark attendance: cPartial → 1 of 2; cDone → 1 of 1.
  await Attendance.create({ scheduleId: cPartial._id, userId: seed.member1._id, status: 'P' });
  await Attendance.create({ scheduleId: cDone._id, userId: seed.member1._id, status: 'P' });
});

afterAll(async () => {
  await teardown();
});

// ── sessionNumber (session-order cache + numbering) ──────────

describe('GET /api/schedules — sessionNumber attachment', () => {
  test('numbers sessions 1..N per class ordered by startTime', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((s) => [s._id, s]));

    // s1a is earlier than s1b within class1.
    expect(byId[s1a._id.toString()].sessionNumber).toBe(1);
    expect(byId[s1b._id.toString()].sessionNumber).toBe(2);
  });
});

// ── getAttendanceCalendar status mapping ─────────────────────

describe('GET /api/schedules/attendance-calendar — status mapping', () => {
  let byId;

  beforeAll(async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    byId = Object.fromEntries(res.body.data.map((s) => [s._id, s]));
  });

  test('none — no enrolled users', () => {
    const s = byId[cNone._id.toString()];
    expect(s.attendanceStatus).toBe('none');
    expect(s.enrolledCount).toBe(0);
    expect(s.markedCount).toBe(0);
  });

  test('pending — enrolled but zero attendance', () => {
    const s = byId[cPending._id.toString()];
    expect(s.attendanceStatus).toBe('pending');
    expect(s.enrolledCount).toBe(2);
    expect(s.markedCount).toBe(0);
  });

  test('partial — some but not all marked', () => {
    const s = byId[cPartial._id.toString()];
    expect(s.attendanceStatus).toBe('partial');
    expect(s.enrolledCount).toBe(2);
    expect(s.markedCount).toBe(1);
  });

  test('done — all enrolled users marked', () => {
    const s = byId[cDone._id.toString()];
    expect(s.attendanceStatus).toBe('done');
    expect(s.enrolledCount).toBe(1);
    expect(s.markedCount).toBe(1);
  });

  test('Participant is denied (Admin/Teacher only)', async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(403);
  });
});

// ── getAvailability — current-week lower bound (P2) ──────────
// The booking grid must show sessions from the START of the current ISO week,
// not just `today`, so an earlier-this-week session (still counted by the
// per-team weekly cap) stays visible. Pins the lower bound = week start.
describe('GET /api/schedules/availability — current-week lower bound', () => {
  const { getWeekBounds } = require('../../domains/schedule/session-booking-policy');
  let earlyThisWeek, lastWeek;

  beforeAll(async () => {
    const { weekStart } = getWeekBounds(new Date());
    const hour = 60 * 60 * 1000;
    // At the start of THIS ISO week (a slot the old `fromDate = today` window
    // would have hidden on any day after Monday).
    earlyThisWeek = await Schedule.create({
      classId: seed.class2._id, bookedTeamId: seed.team._id,
      startTime: new Date(weekStart.getTime() + hour),
      endTime: new Date(weekStart.getTime() + 2 * hour),
      enrolledUsers: [],
    });
    // The day BEFORE this week's start — belongs to the previous week, must NOT appear.
    lastWeek = await Schedule.create({
      classId: seed.class2._id, bookedTeamId: seed.team._id,
      startTime: new Date(weekStart.getTime() - 23 * hour),
      endTime: new Date(weekStart.getTime() - 22 * hour),
      enrolledUsers: [],
    });
  });

  afterAll(async () => {
    await Schedule.deleteMany({ _id: { $in: [earlyThisWeek._id, lastWeek._id] } });
  });

  test('includes a same-week session at/after week start, excludes a prior-week one', async () => {
    const res = await request(app)
      .get('/api/schedules/availability')
      .query({ classId: seed.class2._id.toString() })
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(earlyThisWeek._id.toString());
    expect(ids).not.toContain(lastWeek._id.toString());
  });
});

// ── deliveryType world tag (convergence Phase 3 slice 4b) ────
// Every schedule row carries deliveryType so a UNIFIED calendar can facet team
// vs cohort sessions. Derived from the class's program schedulingMode:
// self_enroll|nomination ⇒ 'cohort'; everything else (incl. program-less legacy
// classes) ⇒ 'team'. Self-contained fixtures (own program/class/schedules),
// torn down so the trainer-only suite below still sees the seeded state.

describe('GET /api/schedules — deliveryType world tag', () => {
  const LearningProgram = require('../../models/LearningProgram');
  const Class = require('../../models/Class');
  let cohortProgram, cohortClass, cohortSched, teamSched;

  beforeAll(async () => {
    cohortProgram = await LearningProgram.create({
      code: 'PROG-COHORT-4B', name: 'Cohort Program 4b', schedulingMode: 'self_enroll',
    });
    cohortClass = await Class.create({
      classCode: 'COHORT4B', courseName: 'Cohort Delivery 4b',
      totalSessions: 5, programId: cohortProgram._id,
    });
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date(Date.now() + 20 * dayMs);
    cohortSched = await Schedule.create({
      classId: cohortClass._id,
      startTime: start, endTime: new Date(start.getTime() + 60 * 60 * 1000),
      enrolledUsers: [seed.member1._id],
    });
    // Contrast row: a team-world session on a program-less seed class.
    teamSched = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: new Date(start.getTime() + dayMs),
      endTime: new Date(start.getTime() + dayMs + 60 * 60 * 1000),
      enrolledUsers: [seed.member1._id],
    });
  });

  afterAll(async () => {
    await Schedule.deleteMany({ _id: { $in: [cohortSched._id, teamSched._id] } });
    await Class.deleteOne({ _id: cohortClass._id });
    await LearningProgram.deleteOne({ _id: cohortProgram._id });
  });

  test('list tags cohort-mode class sessions "cohort" and program-less ones "team"', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .query({ limit: 2000 })
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((s) => [s._id, s]));
    expect(byId[cohortSched._id.toString()].deliveryType).toBe('cohort');
    expect(byId[teamSched._id.toString()].deliveryType).toBe('team');
  });

  // Convergence Phase 3 slice 5: the server-side mode=team|cohort split is
  // retired — the UI facets by deliveryType client-side. A stray mode= param is
  // now ignored; the list returns BOTH worlds (each tagged). This pins the
  // removal so the filter is not re-added.
  test('a stray mode= filter is ignored — both worlds returned, tagged', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .query({ limit: 2000, mode: 'cohort' })
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(cohortSched._id.toString());
    expect(ids).toContain(teamSched._id.toString());
  });

  test('attendance-calendar tags rows with deliveryType', async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((s) => [s._id, s]));
    expect(byId[cohortSched._id.toString()].deliveryType).toBe('cohort');
    expect(byId[teamSched._id.toString()].deliveryType).toBe('team');
  });
});

// ── Trainer-only teacher visibility (Wave E polish) ──────────
// Keep this describe LAST: it rebinds teacherIds on the shared seed classes
// (and restores them) — the suites above assume the seeded empty arrays.

describe('GET /api/schedules/attendance-calendar — trainer-only teacher', () => {
  test('a teacher NOT bound to any class sees exactly the sessions naming them as instructor', async () => {
    const Class = require('../../models/Class');
    // Bind both classes to someone else so the legacy empty-teacherIds
    // graceful arm cannot leak every session to seed.teacher.
    await Class.updateMany(
      { _id: { $in: [seed.class1._id, seed.class2._id] } },
      { $set: { teacherIds: [seed.member1._id] } },
    );
    const dayMs = 24 * 60 * 60 * 1000;
    const start = new Date(Date.now() + 12 * dayMs);
    const instructorSession = await Schedule.create({
      classId: seed.class2._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: new Date(start.getTime() + 60 * 60 * 1000),
      enrolledUsers: [seed.member1._id],
      sessionInstructorIds: [seed.teacher._id],
    });

    const res = await request(app)
      .get('/api/schedules/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(instructorSession._id.toString());
    // No other session leaks — they belong to classes bound to someone else.
    expect(ids).toHaveLength(1);

    // Restore the seeded empty teacherIds for any later reads in this file.
    await Class.updateMany(
      { _id: { $in: [seed.class1._id, seed.class2._id] } },
      { $set: { teacherIds: [] } },
    );
    await Schedule.deleteOne({ _id: instructorSession._id });
  });
});
