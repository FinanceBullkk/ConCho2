/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — reconcile auto-heal (Investment Build Plan #4)
 * ──────────────────────────────────────────────────────────
 * Each of the four SAFE checks applies a deterministic, reversible, audited
 * fix; non-safe checks are rejected (422); the heal route is system.ops-gated.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
const { healCheck, SAFE_CHECKS } = require('../../services/reconcile/healers');
const { checkCounterDrift } = require('../../services/reconcile/counter-checks');

const RoomBooking = require('../../models/RoomBooking');
const WaitlistEntry = require('../../models/WaitlistEntry');
const Team = require('../../models/Team');
const Counter = require('../../models/Counter');
const User = require('../../models/User');
const AuditLog = require('../../models/AuditLog');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await mongoose.disconnect();
});

// auditService.record is fire-and-forget; wait a tick for the write to land.
const settle = () => new Promise((r) => setTimeout(r, 80));

describe('Reconcile auto-heal — healers', () => {
  test('orphan_room_booking → deletes the dangling ledger row + audits', async () => {
    const scheduleId = new mongoose.Types.ObjectId(); // resolves to no Schedule
    await RoomBooking.create({
      roomId: new mongoose.Types.ObjectId(),
      scheduleId,
      classId: seed.class1._id,
      startTime: new Date(),
    });

    const result = await healCheck({ check: 'orphan_room_booking', req: null });
    expect(result.healed).toBeGreaterThanOrEqual(1);
    expect(await RoomBooking.countDocuments({ scheduleId })).toBe(0);

    await settle();
    const row = await AuditLog.findOne({ entity: 'Reconcile', action: 'reconciled' })
      .sort('-createdAt').lean();
    expect(row).not.toBeNull();
    expect(row.note).toMatch(/auto-heal orphan_room_booking/);
  });

  test('stale_waitlist_entry → dissolves the waiting row to cancelled', async () => {
    const deadSchedule = new mongoose.Types.ObjectId(); // session deleted
    const entry = await WaitlistEntry.create({
      scheduleId: deadSchedule,
      classId: seed.class1._id,
      userId: seed.member1._id,
      status: 'waiting',
    });

    const result = await healCheck({ check: 'stale_waitlist_entry', req: null });
    expect(result.healed).toBeGreaterThanOrEqual(1);

    const after = await WaitlistEntry.findById(entry._id).lean();
    expect(after.status).toBe('cancelled');
  });

  test('soft_deleted_in_team_members → pulls the soft-deleted id from members[]', async () => {
    const ghost = await User.create({
      empCode: 'SD-' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      name: 'Soft Deleted Member',
      role: 'Participant',
      password: 'disposable-pwd-12345',
      isDeleted: true,
      deletedAt: new Date(),
    });
    const team = await Team.create({
      name: 'Heal Test Team',
      classId: seed.class1._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id, ghost._id],
    });

    const result = await healCheck({ check: 'soft_deleted_in_team_members', req: null });
    expect(result.healed).toBeGreaterThanOrEqual(1);

    const updated = await Team.findById(team._id).lean();
    expect(updated.members.map(String)).not.toContain(String(ghost._id));
    expect(updated.members.map(String)).toContain(String(seed.leader._id));
  });

  test('counter_drift → bumps Counter.seq up to the check-computed max', async () => {
    // Force a drift: counter behind the codes already in the DB.
    await Counter.findOneAndUpdate({ _id: 'empCode' }, { $set: { seq: 0 } }, { upsert: true });

    const drift = (await checkCounterDrift()).find((i) => i.detail?.counter === 'empCode');
    expect(drift).toBeTruthy(); // seed users carry numeric empCodes → drift at seq 0
    const target = drift.detail.maxInUse;

    await healCheck({ check: 'counter_drift', req: null });

    const counter = await Counter.findById('empCode').lean();
    expect(counter.seq).toBe(target);
    // Re-running the check no longer reports empCode drift.
    const stillDrifting = (await checkCounterDrift())
      .some((i) => i.detail?.counter === 'empCode' && i.detail.seq < i.detail.maxInUse);
    expect(stillDrifting).toBe(false);
  });

  test('healing a clean check is a no-op (healed 0)', async () => {
    await RoomBooking.deleteMany({});
    const result = await healCheck({ check: 'orphan_room_booking', req: null });
    expect(result.attempted).toBe(0);
    expect(result.healed).toBe(0);
    expect(result.remaining).toBe(0);
  });

  test('a non-safe check throws 422', async () => {
    await expect(healCheck({ check: 'duplicate_active_enrollment', req: null }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(SAFE_CHECKS).not.toContain('duplicate_active_enrollment');
  });
});

describe('reconcile heal/trend routes', () => {
  test('POST /heal rejects a non-safe check with 422 + the safe list', async () => {
    const r = await request(app)
      .post('/api/admin/reconcile/heal')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ check: 'missing_attendance' });

    expect(r.status).toBe(422);
    expect(r.body.success).toBe(false);
    expect(r.body.data.safeChecks).toEqual(expect.arrayContaining(['counter_drift']));
  });

  test('POST /heal is forbidden for a non-admin role', async () => {
    const r = await request(app)
      .post('/api/admin/reconcile/heal')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ check: 'counter_drift' });

    expect(r.status).toBe(403);
  });

  test('GET /trend returns summaries oldest→newest', async () => {
    // Two runs so the trend has points.
    await request(app).post('/api/admin/reconcile/run').set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    await request(app).post('/api/admin/reconcile/run').set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    const r = await request(app)
      .post('/api/admin/reconcile/run').set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    expect(r.status).toBe(200);

    const trend = await request(app)
      .get('/api/admin/reconcile/trend?limit=5')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(trend.status).toBe(200);
    expect(Array.isArray(trend.body.data)).toBe(true);
    expect(trend.body.data.length).toBeGreaterThanOrEqual(2);
    // ascending by runAt
    const times = trend.body.data.map((x) => new Date(x.runAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(trend.body.data[0].summary).toBeDefined();
  });
});
