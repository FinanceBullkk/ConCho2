/**
 * ──────────────────────────────────────────────────────────
 * Audit round 2 (Phase 02 — Data Integrity) regressions
 * ──────────────────────────────────────────────────────────
 *   DATA-012: `distinct` runs the soft-delete filter (query middleware —
 *             was bypassed; dashboard filter-options leaked trashed values)
 *   DATA-013: bulk import refuses rows matching soft-deleted users/classes
 *             (the bulkWrite upsert bypasses hooks and would silently
 *             overwrite trash)
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
// Slice-4 ports write through DB_BACKEND repos — assert on the ACTIVE backend.
const { readActiveRow } = require('../pg-test-utils');
const User = require('../../models/User');
const Class = require('../../models/Class');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  // Idempotent fixtures — the harness DB can persist between local runs.
  await User.deleteMany({ empCode: { $in: ['000098', '000099'] } });
  await Class.deleteMany({ classCode: 'TRASHED1' });
});

afterAll(async () => {
  await teardown();
});

describe('DATA-012 — distinct respects soft-delete', () => {
  test("a trashed user's unique department vanishes from User.distinct (explicit trash query still sees it)", async () => {
    const ghost = await User.create({
      empCode: '000099', name: 'Ghost Dept', role: 'Participant',
      department: 'GhostOps-Audit2', password: 'ghost12345',
    });
    expect(await User.distinct('department')).toContain('GhostOps-Audit2');

    await User.updateOne(
      { _id: ghost._id },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );

    // The hook now covers 'distinct' — trashed values stay out...
    expect(await User.distinct('department')).not.toContain('GhostOps-Audit2');
    // ...and the explicit-isDeleted escape hatch still reaches the trash.
    expect(await User.distinct('department', { isDeleted: true })).toContain('GhostOps-Audit2');
  });
});

describe('DATA-013 — import refuses soft-deleted matches', () => {
  test('user import → 400 naming the trashed empCode; trash row untouched', async () => {
    const trashed = await User.create({
      empCode: '000098', name: 'Trashed Import', role: 'Participant',
      department: 'Sales', password: 'trashed12345',
      isDeleted: true, deletedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/import/users')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ users: [{ empCode: trashed.empCode, name: 'New Name', role: 'Participant' }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/trash/i);
    // The trashed doc was NOT silently overwritten.
    const after = await readActiveRow('User', trashed._id);
    expect(after.isDeleted).toBe(true);
    expect(after.name).toBe('Trashed Import');
  });

  test('class import → 400 when matching an archived cohort', async () => {
    await Class.create({
      classCode: 'TRASHED1', courseName: 'Foundation',
      totalSessions: 10, isDeleted: true, deletedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/import/classes')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ classes: [{ classCode: 'TRASHED1', courseName: 'Foundation', totalSessions: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/trash|archived/i);
  });
});
