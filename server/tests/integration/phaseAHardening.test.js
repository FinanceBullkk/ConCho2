/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Phase A hardening (audit PR A)
 * ──────────────────────────────────────────────────────────
 * Covers:
 *   DATA-009 — soft-deleted users are excluded from the analytics +
 *              export joins (Mongo `$lookup` filter → PG `WHERE
 *              is_deleted = false` in the ported repos).
 *   DATA-010 — importService.importUsers does NOT promote `role` on
 *              existing-match rows (silent privilege escalation).
 *   DATA-014 — a password change bumps passwordChangedAt (with a clock-skew
 *              guard) so old JWTs are invalidated.
 *
 * Wave K D2d (re-home, no Mongoose): DATA-014 stopped unit-testing the
 * `User.pre('save')` hook (that hook dies with the model at D2e) and now drives
 * the REAL runtime twin — `PUT /api/auth/change-password`
 * (auth-session.js sets `passwordChangedAt = now()-1s` via the ported PG auth
 * repo) — asserting the bump, the skew guard, and the resulting old-token
 * rejection; the "no bump without a password change" case runs through the
 * admin `PUT /api/users/:id` name update. DATA-009/010 already exercised ported
 * services (attendance analytics / exportService / importService over the
 * DB_BACKEND repos); only their fixtures move to PG-native builders.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow, findActiveRowWhere, updateActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

const pcaMs = async (id) => new Date((await readActiveRow('User', id)).passwordChangedAt).getTime();
const rand = () => Math.random().toString(16).slice(2, 8).toUpperCase();

// ── DATA-014 ────────────────────────────────────────────────

describe('DATA-014 — a password change bumps passwordChangedAt (invalidates old JWTs)', () => {
  test('changing a password bumps passwordChangedAt (skew-guarded) and rejects the old token', async () => {
    const pw = 'initial-pwd-12345';
    const user = await fx.createUser({
      empCode: `D014-${rand()}`, name: 'Phase-A test user', role: 'Participant', password: pw,
    });
    const before = await pcaMs(user._id);
    const token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Wait past the 1s skew guard so the bump is observable.
    await new Promise((r) => setTimeout(r, 1100));

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .set(csrf)
      .send({ currentPassword: pw, newPassword: 'rotated-pwd-67890' });
    expect(res.status).toBe(200);

    const after = await pcaMs(user._id);
    expect(after).toBeGreaterThan(before);          // bumped on password change
    // Skew guard: the handler stamps now()-1s, so the value sits comfortably
    // in the past (a token minted in the same second still fails iat < changedAt).
    expect(Date.now() - after).toBeGreaterThanOrEqual(900);

    // The old token is now rejected (auth cache invalidated → re-read passwordChangedAt).
    const stale = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(stale.status).toBe(401);
  });

  test('a non-password update does NOT bump passwordChangedAt', async () => {
    const user = await fx.createUser({
      empCode: `D014b-${rand()}`, name: 'No-bump user', role: 'Participant', password: 'pwd-12345abc',
    });
    const before = await pcaMs(user._id);

    await new Promise((r) => setTimeout(r, 1100));

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'Renamed only' });
    expect(res.status).toBe(200);

    expect(await pcaMs(user._id)).toBe(before);
  });
});

// ── DATA-010 ────────────────────────────────────────────────

describe('DATA-010 — importService.importUsers cannot elevate role on existing users', () => {
  const importService = require('../../services/importService');

  const ORIGINAL_ENV = { ...process.env };
  beforeAll(() => {
    // Required by importService.getImportDefaultPassword() in test/prod gates.
    process.env.IMPORT_DEFAULT_PASSWORD = 'test-import-default-12345';
  });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  test('existing Participant cannot be promoted to Admin via import payload', async () => {
    // Seed an existing Participant.
    const empCode = `D010-${rand()}`;
    const before = await fx.createUser({
      empCode, name: 'Original Participant', role: 'Participant', password: 'orig-pwd-12345ab',
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
    const empCode = `D010NEW-${rand()}`;
    await importService.importUsers([
      { empCode, name: 'Fresh Admin', role: 'Admin' },
    ]);
    const fresh = await findActiveRowWhere('User', { empCode });
    expect(fresh.role).toBe('Admin');
  });

  test('existing Admin cannot be silently demoted to Participant via import', async () => {
    const empCode = `D010DEMO-${rand()}`;
    await fx.createUser({
      empCode, name: 'Original Admin', role: 'Admin', password: 'orig-pwd-12345ab',
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
  const exportService = require('../../services/exportService');
  const attendanceService = require('../../domains/attendance/use-cases');

  // Seed a fresh user + past schedule + attendance for the given empCode.
  const seedAttendedUser = async (empCode) => {
    const user = await fx.createUser({ empCode, name: 'Soft-Delete Target', role: 'Participant', password: 'pwd-12345abc' });
    const past = new Date(Date.now() - 24 * 3600_000);
    const sched = await fx.createSchedule({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: past, endTime: new Date(past.getTime() + 60 * 60_000),
      enrolledUsers: [user._id],
    });
    await fx.createAttendance({ scheduleId: sched._id, userId: user._id, status: 'P' });
    return user;
  };

  test('analyticsByEmployee aggregation skips soft-deleted users', async () => {
    const user = await seedAttendedUser(`D009ANL-${rand()}`);

    // Sanity: aggregation sees the user when active
    const beforeDelete = await attendanceService.analyticsByEmployee(String(user._id), { page: 1, limit: 50, skip: 0 });
    expect(beforeDelete.data.some((row) => String(row.empCode || '') === user.empCode)).toBe(true);

    await updateActiveRow('User', user._id, { isDeleted: true, deletedAt: new Date() });

    // After soft-delete, aggregation MUST NOT include them
    const afterDelete = await attendanceService.analyticsByEmployee(String(user._id), { page: 1, limit: 50, skip: 0 });
    expect(afterDelete.data.some((row) => String(row.empCode || '') === user.empCode)).toBe(false);
  });

  test('attendance export pipeline excludes soft-deleted users', async () => {
    const user = await seedAttendedUser(`D009EXP-${rand()}`);
    await updateActiveRow('User', user._id, { isDeleted: true, deletedAt: new Date() });

    const result = await exportService.queryExportData({ includeExported: true });
    expect(result.some((row) => row.empCode === user.empCode)).toBe(false);
  });
});
