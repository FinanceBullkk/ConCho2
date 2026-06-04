/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Booking concurrency race (audit PR B / QA-004)
 * ──────────────────────────────────────────────────────────
 * MongoMemoryReplSet supports real Mongo transactions, which is what
 * server/services/scheduleService.js uses to wrap bookSlot. These tests
 * fire two requests in parallel via Promise.all and assert that at most
 * one wins — the other must hit either the unique-index E11000 (converted
 * to 409 by the service) or the weekly-cap guard (400).
 *
 * Without these tests, a regression to the booking transaction (e.g.
 * dropping withTransaction() or removing the unique index) would silently
 * allow double-booking.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  // Same fixture as booking.test.js — add a 10:00-11:00 VN slot to
  // ALLOWED_TIME_SLOTS so vnSlotOnDay()'s 1-hour window matches exactly.
  const Setting = require('../../models/Setting');
  await Setting.findOneAndUpdate(
    { key: 'ALLOWED_TIME_SLOTS' },
    { $addToSet: { value: { sh: 10, sm: 0, eh: 11, em: 0 } } },
    { upsert: false },
  );
});

afterAll(async () => {
  await mongoose.disconnect();
});

afterEach(async () => {
  // Wipe schedules between tests so the weekly cap counts from zero.
  await require('../../models/Schedule').deleteMany({});
});

// Helper from booking.test.js — produce a start/end in next Monday's 10–11 VN slot.
const vnSlotOnDay = (offsetDays = 0) => {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToNextMonday + offsetDays);
  d.setUTCHours(3, 0, 0, 0); // 03:00 UTC = 10:00 VN
  const start = new Date(d);
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  return { start, end };
};

const bookSlot = (start, end) =>
  request(app)
    .post('/api/schedules/book-slot')
    .set('Authorization', `Bearer ${tokens.leader}`)
    .set(csrf)
    .send({
      teamId: seed.team._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

describe('Booking race — Promise.all double-fire on identical slot', () => {
  test('two concurrent bookings of the same (team, slot) → exactly one 201, one 409', async () => {
    const { start, end } = vnSlotOnDay();
    const [r1, r2] = await Promise.all([bookSlot(start, end), bookSlot(start, end)]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    // And the DB has EXACTLY ONE schedule for the slot.
    const Schedule = require('../../models/Schedule');
    const count = await Schedule.countDocuments({
      bookedTeamId: seed.team._id,
      startTime: start,
    });
    expect(count).toBe(1);
  });

  test('three concurrent bookings of the same slot → one 201, two 409', async () => {
    const { start, end } = vnSlotOnDay(1); // different day to keep weekly cap clean
    const [r1, r2, r3] = await Promise.all([
      bookSlot(start, end),
      bookSlot(start, end),
      bookSlot(start, end),
    ]);

    const success = [r1, r2, r3].filter((r) => r.status === 201);
    const collision = [r1, r2, r3].filter((r) => r.status === 409);

    expect(success).toHaveLength(1);
    expect(collision).toHaveLength(2);
  });
});

describe('Booking race — weekly 2-session cap', () => {
  // Boundary race: from an empty week, fire three concurrent bookings on three
  // DIFFERENT free slots. The unique index and collision check do NOT apply
  // (distinct slots), so the cap is enforced solely by the team-document
  // write-lock serializing the transactions. Exactly two must win.
  test('three concurrent bookings on different slots (empty week) → exactly two 201, one 400 cap', async () => {
    const s0 = vnSlotOnDay(0);
    const s1 = vnSlotOnDay(1);
    const s2 = vnSlotOnDay(2);
    const [r0, r1, r2] = await Promise.all([
      bookSlot(s0.start, s0.end),
      bookSlot(s1.start, s1.end),
      bookSlot(s2.start, s2.end),
    ]);

    expect([r0.status, r1.status, r2.status].sort((a, b) => a - b)).toEqual([201, 201, 400]);

    const Schedule = require('../../models/Schedule');
    const count = await Schedule.countDocuments({ bookedTeamId: seed.team._id });
    expect(count).toBe(2);
  });

  test('two slots already booked + Promise.all of two more → both fail with 400 weekly-cap', async () => {
    // Book two slots first (sequential — to fill the cap legitimately).
    const slot1 = vnSlotOnDay(0);
    const slot2 = vnSlotOnDay(1);
    const r1 = await bookSlot(slot1.start, slot1.end);
    const r2 = await bookSlot(slot2.start, slot2.end);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);

    // Now race two more concurrent requests on different slots in the
    // SAME week. Both should hit the weekly cap (countDocuments inside
    // the transaction will see >= 2 already).
    const slot3 = vnSlotOnDay(2);
    const slot4 = vnSlotOnDay(3);
    const [r3, r4] = await Promise.all([
      bookSlot(slot3.start, slot3.end),
      bookSlot(slot4.start, slot4.end),
    ]);

    expect([r3.status, r4.status].sort()).toEqual([400, 400]);
    // And the DB confirms only 2 schedules total.
    const Schedule = require('../../models/Schedule');
    const count = await Schedule.countDocuments({ bookedTeamId: seed.team._id });
    expect(count).toBe(2);
  });
});
