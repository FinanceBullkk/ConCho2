/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — durable cancellation (Wave E3 phase-04, slice A)
 * ──────────────────────────────────────────────────────────
 * Cancellation never hard-deletes: the Schedule flips to status:'cancelled'
 * (who/when/why preserved), the freed {classId,startTime} slot re-books
 * (partial-unique index + live-only collision check), and cancelled rows are
 * excluded from every operational query while staying queryable as history.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
// Cancel + book flow through the ported schedule chokepoint (PG-only on the
// lane), so a Mongoose Schedule read sees the pre-cancel/stale state — read the
// active backend.
const { readActiveRow, findActiveRowsWhere } = require('../pg-test-utils');

const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Setting = require('../../models/Setting');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  // The booking API enforces ALLOWED_TIME_SLOTS exactly — make sure the two
  // exact 1h slots this suite books (10–11 + 11–12 VN) exist (same pattern as
  // booking.test.js; setup.js's default slots are not exact-1h).
  await Setting.findOneAndUpdate(
    { key: 'ALLOWED_TIME_SLOTS' },
    { $addToSet: { value: { $each: [
      { sh: 10, sm: 0, eh: 11, em: 0 },
      { sh: 11, sm: 0, eh: 12, em: 0 },
    ] } } },
    { upsert: false },
  );
});

afterAll(async () => {
  await mongoose.disconnect();
});

// 10:00–11:00 VN == 03:00–04:00Z — a policy-valid booking window on day
// `daysFromNow` (+ slotOffset hours for the later fixed slots).
const slotRange = (daysFromNow, slotOffset = 0) => {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysFromNow);
  start.setUTCHours(3 + slotOffset, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 60 * 60_000) };
};

const leaderCancel = (id, body) => {
  const req = request(app)
    .delete(`/api/schedules/${id}/cancel`)
    .set('Authorization', `Bearer ${tokens.leader}`)
    .set(csrf);
  return body === undefined ? req : req.send(body);
};

describe('Durable cancel — leader cancelSlot', () => {
  test('flips to cancelled (who/when/why), preserves roster + attendance, frees the room field', async () => {
    const { start, end } = slotRange(30);
    const sch = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end,
      enrolledUsers: [seed.leader._id, seed.member1._id],
    });
    await Attendance.create({ scheduleId: sch._id, userId: seed.member1._id, status: 'P' });

    const res = await leaderCancel(sch._id, { cancelReason: 'Trainer is sick' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cancelled/i);

    const after = await readActiveRow('Schedule', sch._id);
    expect(after).not.toBeNull();
    expect(after.status).toBe('cancelled');
    expect(after.cancelledAt).toBeInstanceOf(Date);
    expect(after.cancelledBy.toString()).toBe(seed.leader._id.toString());
    expect(after.cancelReason).toBe('Trainer is sick');
    // Roster snapshot + attendance survive as history (golden rule).
    expect(after.enrolledUsers.map(String)).toContain(seed.member1._id.toString());
    expect(await Attendance.findOne({ scheduleId: sch._id })).not.toBeNull();
  });

  test('double cancel → second gets 409', async () => {
    const { start, end } = slotRange(31);
    const sch = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end, enrolledUsers: [seed.leader._id],
    });

    expect((await leaderCancel(sch._id)).status).toBe(200);
    const second = await leaderCancel(sch._id);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already cancelled/i);
  });

  test('cancelReason longer than 500 chars → 400 validation error', async () => {
    const { start, end } = slotRange(32);
    const sch = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end, enrolledUsers: [seed.leader._id],
    });

    const res = await leaderCancel(sch._id, { cancelReason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect((await Schedule.findById(sch._id)).status).toBe('scheduled');
  });
});

describe('Durable cancel — freed slot re-books', () => {
  test('booking the same {classId,startTime} after a cancel succeeds (partial-unique + live-only collision)', async () => {
    const { start, end } = slotRange(35);

    const first = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id, startTime: start.toISOString(), endTime: end.toISOString() });
    expect(first.status).toBe(201);

    expect((await leaderCancel(first.body.data._id)).status).toBe(200);

    const again = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id, startTime: start.toISOString(), endTime: end.toISOString() });
    expect(again.status).toBe(201);

    // Exactly one LIVE row + one cancelled row share the slot now.
    const rows = await findActiveRowsWhere('Schedule', { classId: seed.class1._id, startTime: start });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === 'scheduled')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'cancelled')).toHaveLength(1);
  });

  test('a cancelled session does not count toward the 2/week team cap', async () => {
    // Anchor on a far-future Monday so all three bookings share one Mon–Sun
    // week deterministically (getWeekBounds is UTC-Monday-based).
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() + 42);
    while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
    monday.setUTCHours(3, 0, 0, 0);

    const at = (dayOffset, slotOffset) => {
      const start = new Date(monday);
      start.setUTCDate(start.getUTCDate() + dayOffset);
      start.setUTCHours(3 + slotOffset, 0, 0, 0);
      return { start, end: new Date(start.getTime() + 60 * 60_000) };
    };
    const book = ({ start, end }) => request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id, startTime: start.toISOString(), endTime: end.toISOString() });

    const mon10 = at(0, 0);
    const mon11 = at(0, 1);
    const tue10 = at(1, 0);

    const r1 = await book(mon10);
    const r2 = await book(mon11);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    // Third booking in the same week hits the 2/week cap…
    const blocked = await book(tue10);
    expect(blocked.status).toBe(400);

    // …until one is cancelled — the cancelled row no longer consumes quota.
    expect((await leaderCancel(r1.body.data._id)).status).toBe(200);
    const after = await book(tue10);
    expect(after.status).toBe(201);
  });
});

describe('Durable cancel — operational queries exclude cancelled rows', () => {
  let live, cancelled;

  beforeAll(async () => {
    const l = slotRange(50, 0);
    const x = slotRange(50, 1);
    live = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: l.start, endTime: l.end, enrolledUsers: [seed.leader._id],
    });
    cancelled = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: x.start, endTime: x.end, enrolledUsers: [seed.leader._id],
    });
    await leaderCancel(cancelled._id, { cancelReason: 'history row' });
  });

  const idsOf = (res) => (res.body.data || []).map((s) => String(s._id));

  test('availability grid omits the cancelled session (slot renders free)', async () => {
    const res = await request(app)
      .get('/api/schedules/availability')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(200);
    expect(idsOf(res)).toContain(String(live._id));
    expect(idsOf(res)).not.toContain(String(cancelled._id));
  });

  test('participant schedule list omits cancelled rows (forced live-only)', async () => {
    const res = await request(app)
      .get('/api/schedules?limit=2000&status=all') // learner cannot opt into history
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(200);
    expect(idsOf(res)).toContain(String(live._id));
    expect(idsOf(res)).not.toContain(String(cancelled._id));
  });

  test('admin list is live-only by default; ?status=cancelled returns the history view', async () => {
    const byDefault = await request(app)
      .get('/api/schedules?limit=2000')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(idsOf(byDefault)).toContain(String(live._id));
    expect(idsOf(byDefault)).not.toContain(String(cancelled._id));

    const history = await request(app)
      .get('/api/schedules?limit=2000&status=cancelled')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(idsOf(history)).toContain(String(cancelled._id));
    expect(idsOf(history)).not.toContain(String(live._id));
  });

  test('editing a cancelled session → 409', async () => {
    const res = await request(app)
      .put(`/api/schedules/${cancelled._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ capacity: 5 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cancelled/i);
  });

  test('reminder claim never touches a cancelled session', async () => {
    const { sendUpcomingReminders } = require('../../services/reminderService');
    const soonLive = slotRange(0, 6);   // a few hours ahead — inside the 24h window
    const soonGone = slotRange(0, 7);
    // Direct create: reminder claim is filter-based, slot policy not involved.
    const liveSoon = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: soonLive.start, endTime: soonLive.end, enrolledUsers: [seed.member1._id],
    });
    const goneSoon = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: soonGone.start, endTime: soonGone.end, enrolledUsers: [seed.member1._id],
      status: 'cancelled', cancelledAt: new Date(),
    });

    await sendUpcomingReminders({ now: new Date(soonLive.start.getTime() - 60 * 60_000) });

    expect((await Schedule.findById(liveSoon._id)).remindersSentAt).not.toBeNull();
    expect((await Schedule.findById(goneSoon._id)).remindersSentAt).toBeNull();
  });
});
