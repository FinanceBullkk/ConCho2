/**
 * Integration Tests — Booking Flow
 * Uses shared test setup (MongoMemoryServer + seed data from setup.js).
 *
 * Run: npm test -- --testPathPatterns=booking
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Setting = require('../../models/Setting');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  // CSRF double-submit cookie + header is required for all POST/PUT/DELETE
  // (csrfProtection middleware). Fetch once and reuse across tests.
  csrf = await getCsrfHeaders(app);

  // Ensure ALLOWED_TIME_SLOTS includes a 10:00–11:00 VN slot (= 03:00–04:00 UTC)
  // setup.js may already have 10:00–11:30, which covers this range.
  // We add a separate exact slot for test predictability.
  await Setting.findOneAndUpdate(
    { key: 'ALLOWED_TIME_SLOTS' },
    { $addToSet: { value: { sh: 10, sm: 0, eh: 11, em: 0 } } },
    { upsert: false }
  );
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Schedule.deleteMany({});
});

// Helper: produce a start/end pair in next week, at 10:00–11:00 VN (03:00–04:00 UTC)
// offsetDays spreads test slots across different days so they don't collide.
const vnSlot = (offsetDays = 0) => {
  const d = new Date();
  // Jump to next Monday so tests are always in a future week
  const dayOfWeek = d.getUTCDay();
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToNextMonday + offsetDays);
  d.setUTCHours(3, 0, 0, 0); // 03:00 UTC = 10:00 VN
  const start = new Date(d);
  const end = new Date(d.getTime() + 60 * 60 * 1000); // +1 hour
  return { start, end };
};

// ── Booking ───────────────────────────────────────────────

describe('POST /api/schedules/book-slot', () => {
  test('leader can book a valid time slot', async () => {
    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({
        teamId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookedTeamId).toBeTruthy();
    expect(res.body.data.enrolledUsers).toBeTruthy();
    expect(res.body.data.group).toBeUndefined();
    expect(res.body.data.enrolledLearners).toBeUndefined();
  });

  test('enrolled users are auto-populated from active team members', async () => {
    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({
        teamId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    // Alpha Team has 3 members (leader, member1, member2)
    expect(res.body.data.enrolledUsers.length).toBe(3);
  });

  test('3rd booking in same week is rejected (weekly limit = 2)', async () => {
    // All three slots are in the same Mon–Sun week (offsetDays 0,1,2 from next Monday)
    const slots = [vnSlot(0), vnSlot(1), vnSlot(2)];

    await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: slots[0].start.toISOString(), endTime: slots[0].end.toISOString() })
      .expect(201);

    await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: slots[1].start.toISOString(), endTime: slots[1].end.toISOString() })
      .expect(201);

    const res3 = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: slots[2].start.toISOString(), endTime: slots[2].end.toISOString() });

    expect(res3.status).toBe(400);
    expect(res3.body.message).toMatch(/maximum 2 sessions/);
  });

  test('overlapping time slot is rejected (409)', async () => {
    const { start, end } = vnSlot();

    await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() })
      .expect(201);

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(409);
  });

  test('non-leader participant cannot book for a team they do not lead', async () => {
    const { start, end } = vnSlot();
    // tokens.teacher is not the leader of seed.team
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.teacher}`).set(csrf)
      .send({
        teamId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    // Teacher role is not in roleGuard('Admin', 'Participant') → 403
    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const { start, end } = vnSlot();
    // Pass CSRF so the request reaches the auth middleware (csrfProtection
    // runs first; without it the response would be 403 CSRF, masking the
    // auth check this test is meant to exercise).
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(401);
  });

  test('invalid time slot (not in ALLOWED_TIME_SLOTS) is rejected', async () => {
    // 05:00 UTC = 12:00 VN — not in allowed slots
    const badStart = new Date(vnSlot().start);
    badStart.setUTCHours(5, 0, 0, 0);
    const badEnd = new Date(badStart.getTime() + 60 * 60 * 1000);

    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({
        teamId: seed.team._id.toString(),
        startTime: badStart.toISOString(),
        endTime: badEnd.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/allowed time slot/);
  });
});

// ── Capacity (Wave E2) ────────────────────────────────────
// Link the seed class to a leader_booking program so the leader reaches the
// in-transaction capacity gate; its maxParticipantsPerSession is the effective
// per-session cap. Alpha Team has 3 active members.

describe('POST /api/schedules/book-slot · capacity', () => {
  let program;

  beforeEach(async () => {
    program = await LearningProgram.create({
      code: 'CAPTEST', name: 'Capacity Test Program',
      schedulingMode: 'leader_booking',
      capacityPolicy: { maxParticipantsPerSession: 2 },
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
  });

  afterEach(async () => {
    await Class.findByIdAndUpdate(seed.class1._id, { programId: null });
    await LearningProgram.deleteMany({ code: 'CAPTEST' });
  });

  test('roster exceeding the cap is rejected (422) and no Schedule is persisted', async () => {
    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/capacity/);
    expect(await Schedule.countDocuments({})).toBe(0); // gate runs before create — nothing written
  });

  test('program maxParticipantsPerSession raises the cap; roster within it books (201)', async () => {
    await LearningProgram.findByIdAndUpdate(program._id, {
      'capacityPolicy.maxParticipantsPerSession': 5,
    });
    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.data.enrolledUsers.length).toBe(3);
  });
});

// ── Cancel ────────────────────────────────────────────────

describe('DELETE /api/schedules/:id/cancel', () => {
  test('leader can cancel their own booking', async () => {
    const { start, end } = vnSlot();
    const createRes = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() })
      .expect(201);

    const scheduleId = createRes.body.data._id;
    await request(app)
      .delete(`/api/schedules/${scheduleId}/cancel`)
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .expect(200);

    const check = await Schedule.findById(scheduleId);
    expect(check).toBeNull();
  });

  test('admin can cancel any booking', async () => {
    const { start, end } = vnSlot();
    const createRes = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() })
      .expect(201);

    const scheduleId = createRes.body.data._id;
    await request(app)
      .delete(`/api/schedules/${scheduleId}/cancel`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .expect(200);
  });
});

// ── enrolledCount virtual ─────────────────────────────────

describe('Schedule.enrolledCount virtual (ARCH-02)', () => {
  test('enrolledCount equals enrolledUsers.length — never stored, never drifts', async () => {
    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/schedules/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf)
      .send({ teamId: seed.team._id.toString(), startTime: start.toISOString(), endTime: end.toISOString() })
      .expect(201);

    const doc = await Schedule.findById(res.body.data._id);
    // Virtual should equal array length — no stored field can drift
    expect(doc.enrolledCount).toBe(doc.enrolledUsers.length);
    // Confirm no stored field (raw object should not have it)
    const raw = doc.toObject({ virtuals: false });
    expect(raw.enrolledCount).toBeUndefined();
  });
});
