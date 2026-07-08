/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Phase A hardening (audit PR A)
 * ──────────────────────────────────────────────────────────
 * Covers:
 *   DATA-009 — $lookup users in attendance + export pipelines now
 *              filters soft-deleted users at the join.
 *   DATA-010 — importService.importUsers does NOT promote `role` on
 *              existing-match rows (silent privilege escalation).
 *   DATA-014 — User pre('save') auto-bumps passwordChangedAt whenever
 *              the password changes, so old JWTs are invalidated even
 *              when callers forget to set it explicitly.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
// Slice-4 ports write through DB_BACKEND repos — assert on the ACTIVE backend.
const { findActiveRowWhere } = require('../pg-test-utils');

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

// ── DATA-014 ────────────────────────────────────────────────

describe('DATA-014 — User.pre(save) bumps passwordChangedAt automatically', () => {
  const User = require('../../models/User');

  test('saving a user with a NEW password bumps passwordChangedAt', async () => {
    const user = await User.create({
      empCode: 'D014-' + Math.random().toString(16).slice(2, 8),
      name: 'Phase-A test user',
      role: 'Participant',
      password: 'initial-pwd-12345',
    });
    const before = user.passwordChangedAt?.getTime() ?? 0;

    // Wait a couple seconds so the bump is observable past the 1s skew guard.
    await new Promise((r) => setTimeout(r, 1100));

    user.password = 'rotated-pwd-67890';
    await user.save();

    const after = user.passwordChangedAt.getTime();
    expect(after).toBeGreaterThan(before);
  });

  test('saving a user with NO password change does NOT bump passwordChangedAt', async () => {
    const user = await User.create({
      empCode: 'D014b-' + Math.random().toString(16).slice(2, 8),
      name: 'No-bump user',
      role: 'Participant',
      password: 'pwd-12345abc',
    });
    const before = user.passwordChangedAt.getTime();

    await new Promise((r) => setTimeout(r, 1100));

    user.name = 'Renamed only';
    await user.save();

    expect(user.passwordChangedAt.getTime()).toBe(before);
  });

  test('saved passwordChangedAt is slightly in the past (clock-skew guard)', async () => {
    const before = Date.now();
    const user = await User.create({
      empCode: 'D014c-' + Math.random().toString(16).slice(2, 8),
      name: 'Skew guard user',
      role: 'Participant',
      password: 'pwd-12345abc',
    });
    // The hook subtracts 1s so a JWT minted in the same second
    // (iat = floor(Date.now()/1000)) still fails the iat < changedAt check.
    expect(user.passwordChangedAt.getTime()).toBeLessThanOrEqual(before);
  });
});

// ── DATA-010 ────────────────────────────────────────────────

describe('DATA-010 — importService.importUsers cannot elevate role on existing users', () => {
  const User = require('../../models/User');
  const importService = require('../../services/importService');

  const ORIGINAL_ENV = { ...process.env };
  beforeAll(() => {
    // Required by importService.getImportDefaultPassword() in test/prod gates.
    process.env.IMPORT_DEFAULT_PASSWORD = 'test-import-default-12345';
  });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  test('existing Participant cannot be promoted to Admin via import payload', async () => {
    // Seed an existing Participant.
    const empCode = 'D010-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    const before = await User.create({
      empCode,
      name: 'Original Participant',
      role: 'Participant',
      password: 'orig-pwd-12345ab',
    });
    expect(before.role).toBe('Participant');

    // Attempt the privilege-escalation payload.
    await importService.importUsers([
      { empCode, name: 'Renamed Participant', role: 'Admin' },
    ]);

    const after = await findActiveRowWhere('User', { empCode });
    expect(after.name).toBe('Renamed Participant'); // name allowed
    expect(after.role).toBe('Participant');         // role NOT promoted
  });

  test('NEW user inserted via import does inherit the payload role (legit new admin)', async () => {
    const empCode = 'D010NEW-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    await importService.importUsers([
      { empCode, name: 'Fresh Admin', role: 'Admin' },
    ]);
    const fresh = await findActiveRowWhere('User', { empCode });
    expect(fresh.role).toBe('Admin');
  });

  test('existing Admin cannot be silently demoted to Participant via import', async () => {
    const empCode = 'D010DEMO-' + Math.random().toString(16).slice(2, 8).toUpperCase();
    await User.create({
      empCode,
      name: 'Original Admin',
      role: 'Admin',
      password: 'orig-pwd-12345ab',
    });

    await importService.importUsers([
      { empCode, name: 'Try Demote', role: 'Participant' },
    ]);

    const after = await findActiveRowWhere('User', { empCode });
    expect(after.role).toBe('Admin'); // not demoted either — same gate works both directions
    expect(after.name).toBe('Try Demote');
  });
});

// ── DATA-009 ────────────────────────────────────────────────

describe('DATA-009 — soft-deleted user is excluded from analytics + export joins', () => {
  const User = require('../../models/User');
  const Schedule = require('../../models/Schedule');
  const Attendance = require('../../models/Attendance');
  const exportService = require('../../services/exportService');
  const attendanceService = require('../../domains/attendance/use-cases');

  test('analyticsByEmployee aggregation skips soft-deleted users', async () => {
    // Create a fresh user + past schedule + attendance, then soft-delete.
    const user = await User.create({
      empCode: 'D009ANL-' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      name: 'To Be Soft-Deleted',
      role: 'Participant',
      password: 'pwd-12345abc',
    });
    const past = new Date(Date.now() - 24 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [user._id],
    });
    await Attendance.create({
      scheduleId: sched._id,
      userId: user._id,
      status: 'P',
    });

    // Sanity: aggregation sees the user when active
    const beforeDelete = await attendanceService.analyticsByEmployee(String(user._id), { page: 1, limit: 50, skip: 0 });
    const seenBefore = beforeDelete.data.some((row) => String(row.empCode || '') === user.empCode);
    expect(seenBefore).toBe(true);

    // Soft-delete the user
    await User.updateOne({ _id: user._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

    // After soft-delete, aggregation MUST NOT include them
    const afterDelete = await attendanceService.analyticsByEmployee(String(user._id), { page: 1, limit: 50, skip: 0 });
    const seenAfter = afterDelete.data.some((row) => String(row.empCode || '') === user.empCode);
    expect(seenAfter).toBe(false);
  });

  test('attendance export pipeline excludes soft-deleted users', async () => {
    const user = await User.create({
      empCode: 'D009EXP-' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      name: 'Soft-Deleted Export',
      role: 'Participant',
      password: 'pwd-12345abc',
    });
    const past = new Date(Date.now() - 24 * 3600_000);
    const sched = await Schedule.create({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [user._id],
    });
    await Attendance.create({
      scheduleId: sched._id,
      userId: user._id,
      status: 'P',
      syncStatus: 'PENDING',
    });

    // Soft-delete BEFORE export
    await User.updateOne({ _id: user._id }, { $set: { isDeleted: true, deletedAt: new Date() } });

    const result = await exportService.queryExportData({ includeExported: true });
    const seen = result.some((row) => row.empCode === user.empCode);
    expect(seen).toBe(false);
  });
});
