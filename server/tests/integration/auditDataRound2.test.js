/**
 * ──────────────────────────────────────────────────────────
 * Audit round 2 (Phase 02 — Data Integrity) regressions
 * ──────────────────────────────────────────────────────────
 *   DATA-012: soft-deleted rows drop out of the distinct filter-options
 *             (Mongo: `distinct` query middleware; PG: the ported
 *             dashboard-stats distinct's `WHERE is_deleted = false`).
 *   DATA-013: bulk import refuses rows matching soft-deleted users/classes
 *             (would otherwise silently overwrite trash).
 *
 * Wave K D2d (re-home, no Mongoose): DATA-012 no longer probes the raw
 * `User.distinct(...)` middleware — that abstraction dies with the model at
 * D2e. It now asserts the REAL app contract through `GET /api/dashboard/
 * filter-options` (→ `dashboard-stats-repository.pg.getFilterDistincts`, which
 * filters `is_deleted = false`); the "explicit trash query still sees it"
 * escape hatch is re-expressed as a direct PG trash read (there is no
 * middleware escape hatch on PG — trash views query `is_deleted = true`
 * explicitly). DATA-013 already drove the HTTP import routes; only its fixtures
 * move to PG-native builders. Fire-and-forget nothing — all synchronous.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const {
  readActiveRow, deleteActiveRowsWhere, updateActiveRow, distinctActiveValues,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  // Idempotent fixtures — the shared PG db is truncated per file, but keep the
  // guard so a re-run over a dirty local db can't collide on these empCodes.
  await deleteActiveRowsWhere('User', { empCode: { $in: ['000098', '000099'] } });
  await deleteActiveRowsWhere('Class', { classCode: 'TRASHED1' });
});

afterAll(async () => {
  await teardown();
});

describe('DATA-012 — distinct filter-options respect soft-delete', () => {
  // GET /api/dashboard/filter-options is cached (analyticsCache); flush before
  // each read so a soft-delete between reads is actually observed.
  const departments = async () => {
    invalidateAnalyticsCache();
    const res = await request(app)
      .get('/api/dashboard/filter-options')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    return res.body.data.departments;
  };

  test("a trashed participant's unique department vanishes from filter-options (explicit trash query still sees it)", async () => {
    const ghost = await fx.createUser({
      empCode: '000099', name: 'Ghost Dept', role: 'Participant',
      department: 'GhostOps-Audit2', password: 'ghost12345',
    });
    expect(await departments()).toContain('GhostOps-Audit2');

    await updateActiveRow('User', ghost._id, { isDeleted: true, deletedAt: new Date() });

    // The distinct now covers soft-delete — trashed values stay out...
    expect(await departments()).not.toContain('GhostOps-Audit2');
    // ...and an explicit trash read still reaches the value (no data lost).
    expect(await distinctActiveValues('User', 'department', { isDeleted: true }))
      .toContain('GhostOps-Audit2');
  });
});

describe('DATA-013 — import refuses soft-deleted matches', () => {
  test('user import → 400 naming the trashed empCode; trash row untouched', async () => {
    const trashed = await fx.createUser({
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
    await fx.createClass({
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
