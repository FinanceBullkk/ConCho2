/**
 * Integration — admin analytics dashboard (GET /api/dashboard/*).
 *
 * This endpoint had no integration coverage; the smoke test was added with the
 * Phase 0 repository extraction (dashboard-stats-repository.js) so the refactor
 * is provably behaviour-preserving. Asserts the composed response shape + the
 * ANALYTICS_READ (Admin-only) gate, against the shared seed.
 */
const request = require('supertest');
const { getApp, getTokens } = require('../setup');

let app, tokens;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
});

const asAdmin = (path) => request(app).get(path).set('Authorization', `Bearer ${tokens.admin}`);

describe('GET /api/dashboard (admin analytics)', () => {
  test('filter-options returns the five distinct dimensions as arrays', async () => {
    const res = await asAdmin('/api/dashboard/filter-options');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const k of ['departments', 'positions', 'entranceLevels', 'currentLevels', 'statuses']) {
      expect(Array.isArray(res.body.data[k])).toBe(true);
    }
  });

  test('stats returns the composed analytics shape', async () => {
    const res = await asAdmin('/api/dashboard/stats');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(typeof d.overview.totalStudents).toBe('number');
    expect(d.overview.attendanceRate).toBeGreaterThanOrEqual(0);
    for (const k of [
      'courseBreakdown', 'classProgress', 'departmentBreakdown', 'positionBreakdown',
      'entranceLevelBreakdown', 'currentLevelBreakdown', 'levelProgression',
    ]) {
      expect(d).toHaveProperty(k);
    }
    expect(d.activeFilters).toBeNull(); // unfiltered request
  });

  test('stats honours a filter and echoes it back', async () => {
    const res = await asAdmin('/api/dashboard/stats?status=Active');
    expect(res.status).toBe(200);
    expect(res.body.data.activeFilters).toMatchObject({ status: 'Active' });
  });

  test('denies a non-admin (Teacher lacks analytics.read) with 403', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(403);
  });
});
