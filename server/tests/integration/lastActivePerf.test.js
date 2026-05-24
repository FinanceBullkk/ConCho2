/**
 * Integration Tests — User.lastActiveAt write-through cache (PERF-008)
 *
 * Verifies that attendanceService.bulkMark denormalises lastActiveAt
 * onto the User document, and that getUsers reads it directly without
 * the old per-page aggregation.
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
});

afterAll(async () => {
  await mongoose.disconnect();
});

const cleanup = async () => {
  const Schedule = require('../../models/Schedule');
  const Attendance = require('../../models/Attendance');
  const User = require('../../models/User');
  await Attendance.deleteMany({ remark: 'PR-H-lastActive-fixture' });
  await Schedule.deleteMany({ roomLink: 'PR-H-lastActive-fixture' });
  await User.updateMany(
    { empCode: { $in: [seed.member1.empCode, seed.member2.empCode] } },
    { $set: { lastActiveAt: null } },
  );
};
beforeEach(cleanup);

describe('PERF-008 — lastActiveAt write-through', () => {
  const User = require('../../models/User');
  const Schedule = require('../../models/Schedule');

  test('bulkMark with status:P updates lastActiveAt on the user', async () => {
    const past = new Date(Date.now() - 6 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id, seed.member2._id],
      roomLink: 'PR-H-lastActive-fixture',
    });

    const r = await request(app)
      .post(`/api/attendance/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        records: [
          { userId: seed.member1._id, status: 'P' },
          { userId: seed.member2._id, status: 'A' },
        ],
      });
    expect(r.status).toBe(200);

    // member1 marked Present → lastActiveAt should match the schedule's
    // startTime (NOT the createdAt of the Attendance doc).
    const m1 = await User.findById(seed.member1._id).lean();
    expect(m1.lastActiveAt).toBeTruthy();
    expect(new Date(m1.lastActiveAt).toISOString()).toBe(past.toISOString());

    // member2 marked Absent → lastActiveAt MUST stay null.
    const m2 = await User.findById(seed.member2._id).lean();
    expect(m2.lastActiveAt).toBeNull();
  });

  test('$max guard: re-marking an OLDER session does NOT move lastActiveAt backwards', async () => {
    // Establish a recent active timestamp first.
    const recent = new Date(Date.now() - 24 * 3600_000);
    const schedRecent = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: recent,
      endTime: new Date(recent.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
      roomLink: 'PR-H-lastActive-fixture',
    });
    await request(app)
      .post(`/api/attendance/${schedRecent._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'P' }] });

    let m1 = await User.findById(seed.member1._id).lean();
    expect(new Date(m1.lastActiveAt).getTime()).toBe(recent.getTime());

    // Now mark an OLDER session — lastActiveAt should NOT regress.
    const older = new Date(Date.now() - 7 * 24 * 3600_000);
    const schedOlder = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: older,
      endTime: new Date(older.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
      roomLink: 'PR-H-lastActive-fixture',
    });
    await request(app)
      .post(`/api/attendance/${schedOlder._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'P' }] });

    m1 = await User.findById(seed.member1._id).lean();
    expect(new Date(m1.lastActiveAt).getTime()).toBe(recent.getTime()); // still recent
  });

  test('Late (L) status also updates lastActiveAt', async () => {
    const past = new Date(Date.now() - 3 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
      roomLink: 'PR-H-lastActive-fixture',
    });
    await request(app)
      .post(`/api/attendance/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'L' }] });

    const m1 = await User.findById(seed.member1._id).lean();
    expect(m1.lastActiveAt).toBeTruthy();
  });

  test('EL (excused) does NOT update lastActiveAt', async () => {
    const past = new Date(Date.now() - 3 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
      roomLink: 'PR-H-lastActive-fixture',
    });
    await request(app)
      .post(`/api/attendance/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'EL' }] });

    const m1 = await User.findById(seed.member1._id).lean();
    expect(m1.lastActiveAt).toBeNull();
  });

  test('GET /users surfaces lastActive + daysSince from the cached field', async () => {
    const past = new Date(Date.now() - 48 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
      roomLink: 'PR-H-lastActive-fixture',
    });
    await request(app)
      .post(`/api/attendance/${sched._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ records: [{ userId: seed.member1._id, status: 'P' }] });

    const list = await request(app)
      .get(`/api/users?search=${seed.member1.empCode}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.status).toBe(200);
    const m1 = list.body.data.find((u) => u.empCode === seed.member1.empCode);
    expect(m1).toBeDefined();
    expect(m1.lastActive).toBeTruthy();
    expect(m1.daysSince).toBeGreaterThanOrEqual(1);
    expect(m1.daysSince).toBeLessThanOrEqual(3);
  });
});

// ── PERF-006 ───────────────────────────────────────────────

describe('PERF-006 — import batch cap', () => {
  test('501-row payload returns 400 (default cap 500)', async () => {
    // MAX_IMPORT_BATCH is read at module-init. Test harness sets
    // IMPORT_MAX_BATCH=undefined so the default (500) applies. Send
    // 501 rows to trip the cap. We pre-fail validation on missing
    // role/name to keep the payload tiny; the cap check runs first.
    const oversize = new Array(501).fill(0).map((_, i) => ({
      empCode: `OV${i.toString().padStart(4, '0')}`,
      name: `Over ${i}`,
      role: 'Participant',
    }));

    const r = await request(app)
      .post('/api/import/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ users: oversize });

    expect(r.status).toBe(400);
    // Message comes from either the Zod schema ("Max 500 users per batch")
    // or the service-layer guard ("Too many records ... Maximum N").
    expect(r.body.message).toMatch(/Too many|Maximum|Max 500|per batch/i);
  });
});
