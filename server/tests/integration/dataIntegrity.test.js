/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — data integrity hardening (audit PR 6)
 * ──────────────────────────────────────────────────────────
 * Covers:
 *   DATA-002 — Partial unique index on Class { classCode, status:Ongoing }
 *   DATA-005 — cancelSlot guard for past schedules
 *   DATA-007 — Team.pre('aggregate') soft-delete filter
 *   DATA-013 — Schedule pre('validate') endTime > startTime guard
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

// ── DATA-002 ────────────────────────────────────────────────

describe('DATA-002 — Class Ongoing partial unique', () => {
  const Class = require('../../models/Class');

  // The dup-insert below needs the partial unique index BUILT, not just
  // declared — autoIndex builds in the background and loses the race on a
  // slow/loaded machine (ledger lesson: force Model.init()).
  beforeAll(async () => {
    await Class.init();
  });

  test('two Ongoing classes with same classCode fail with E11000', async () => {
    const code = 'DI002-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    await Class.create({
      classCode: code,
      courseName: 'Foundation',
      totalSessions: 10,
      status: 'Ongoing',
    });

    let err = null;
    try {
      await Class.create({
        classCode: code,
        courseName: 'Communication 1',     // different courseName so the
        totalSessions: 10,                  // existing {classCode,courseName}
        status: 'Ongoing',                  // unique does NOT fire
      });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.code || err.cause?.code).toBe(11000);
  });

  test('one Ongoing + one Completed for same classCode is allowed', async () => {
    const code = 'DI002OK-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    await Class.create({ classCode: code, courseName: 'Foundation', totalSessions: 10, status: 'Ongoing' });
    // Promote to completed, then a new Ongoing slot opens up
    await Class.updateOne({ classCode: code, courseName: 'Foundation' }, { $set: { status: 'Completed' } });
    const second = await Class.create({
      classCode: code, courseName: 'Communication 1', totalSessions: 10, status: 'Ongoing',
    });
    expect(second._id).toBeTruthy();
  });
});

// ── DATA-005 ────────────────────────────────────────────────

describe('DATA-005 — cancelSlot refuses past schedules', () => {
  const Schedule = require('../../models/Schedule');
  const Attendance = require('../../models/Attendance');

  test('cancelling a schedule whose startTime is in the past returns 409 and preserves attendance', async () => {
    const past = new Date(Date.now() - 24 * 3600_000);
    const sch = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
    });
    await Attendance.create({
      scheduleId: sch._id,
      userId: seed.member1._id,
      status: 'P',
    });

    const res = await request(app)
      .delete(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already started|preserved/i);

    // Schedule and attendance both still exist
    const stillSch = await Schedule.findById(sch._id);
    expect(stillSch).not.toBeNull();
    const stillAtt = await Attendance.findOne({ scheduleId: sch._id });
    expect(stillAtt).not.toBeNull();

    // Cleanup
    await Attendance.deleteMany({ scheduleId: sch._id });
    await Schedule.findByIdAndDelete(sch._id);
  });

  test('cancelling a future schedule succeeds — durable flip, doc preserved', async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600_000);
    const sch = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: future,
      endTime: new Date(future.getTime() + 60 * 60_000),
      enrolledUsers: [seed.member1._id],
    });

    const res = await request(app)
      .delete(`/api/schedules/${sch._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(200);
    // Phase-04 slice A: the doc persists as cancelled history (never deleted).
    const after = await Schedule.findById(sch._id);
    expect(after).not.toBeNull();
    expect(after.status).toBe('cancelled');

    // Cleanup so later suites in this file see a clean slate.
    await Schedule.findByIdAndDelete(sch._id);
  });
});

// ── DATA-007 ────────────────────────────────────────────────

describe('DATA-007 — Team.aggregate filters soft-deleted', () => {
  const Team = require('../../models/Team');

  test('soft-deleted team does NOT appear in plain aggregate', async () => {
    const t = await Team.create({
      name: 'SD-Aggregate Team',
      classId: seed.class1._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id],
    });
    await Team.updateOne({ _id: t._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

    const rows = await Team.aggregate([{ $match: { name: 'SD-Aggregate Team' } }]);
    expect(rows.length).toBe(0);
  });

  test('caller-supplied $match: { isDeleted: true } still works (override)', async () => {
    const t = await Team.create({
      name: 'SD-Aggregate Override',
      classId: seed.class1._id,
      leaderId: seed.leader._id,
      members: [seed.leader._id],
    });
    await Team.updateOne({ _id: t._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

    const rows = await Team.aggregate([
      { $match: { isDeleted: true, name: 'SD-Aggregate Override' } },
    ]);
    expect(rows.length).toBe(1);
  });
});

// ── DATA-013 ────────────────────────────────────────────────

describe('DATA-013 — Schedule cross-field validator', () => {
  const Schedule = require('../../models/Schedule');

  test('endTime <= startTime is rejected on save', async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    let err = null;
    try {
      await Schedule.create({
        classId: seed.class1._id,
        bookedTeamId: seed.team._id,
        startTime: start,
        endTime: new Date(start.getTime() - 60_000), // BEFORE start
        enrolledUsers: [],
      });
    } catch (e) { err = e; }
    expect(err).not.toBeNull();
    expect(String(err.message)).toMatch(/endTime must be strictly greater/);
  });

  test('endTime === startTime is rejected (strict inequality)', async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    let err = null;
    try {
      await Schedule.create({
        classId: seed.class1._id,
        bookedTeamId: seed.team._id,
        startTime: start,
        endTime: start,
        enrolledUsers: [],
      });
    } catch (e) { err = e; }
    expect(err).not.toBeNull();
  });

  test('endTime > startTime is accepted', async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    const sch = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: start,
      endTime: new Date(start.getTime() + 60 * 60_000),
      enrolledUsers: [],
    });
    expect(sch._id).toBeTruthy();
    await Schedule.findByIdAndDelete(sch._id);
  });
});
