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
