/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Settings Routes
 * GET /api/settings
 * PUT /api/settings
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');

let app, tokens, seed;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

// ── GET /api/settings ────────────────────────────────────
// GET is a safe method — no CSRF required.

describe('GET /api/settings', () => {
  test('returns 200 with settings array for Admin', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // The seed creates ALLOWED_TIME_SLOTS so at least one entry exists
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('returns 403 when called by a Teacher', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 403 when called by a Participant', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
  });
});

// ── PUT /api/settings ────────────────────────────────────
// PUT is a state-changing method — CSRF token required.

describe('PUT /api/settings', () => {
  const validTimeSlots = [
    { sh: 9, sm: 0, eh: 10, em: 30, label: '09:00-10:30' },
  ];

  test('returns 200 and updates an allowed setting key as Admin', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        settings: [{ key: 'ALLOWED_TIME_SLOTS', value: validTimeSlots }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // The updated key should be in the returned data
    const updated = res.body.data.find((s) => s.key === 'ALLOWED_TIME_SLOTS');
    expect(updated).toBeDefined();
    // Warning should NOT be present when all keys are valid
    expect(res.body.warning).toBeUndefined();
  });

  test('returns 200 with a warning when an unknown key is supplied', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        settings: [{ key: 'UNKNOWN_KEY', value: 'something' }],
      });

    // Controller returns 200 but silently drops unknown keys with a warning
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.warning).toMatch(/UNKNOWN_KEY/);
  });

  test('returns 400 when settings field is not an array', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ settings: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 403 when called by a Participant (role block before body check)', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        settings: [{ key: 'ALLOWED_TIME_SLOTS', value: validTimeSlots }],
      });

    expect(res.status).toBe(403);
  });

  test('returns 401 without authentication', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set(csrf)
      .send({
        settings: [{ key: 'ALLOWED_TIME_SLOTS', value: validTimeSlots }],
      });

    expect(res.status).toBe(401);
  });

  // Wave E1: scheduling config is validated on write. These rejected payloads
  // leave the stored setting unchanged (no shared-state pollution).
  test('returns 400 when ALLOWED_TIME_SLOTS has overlapping windows', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        settings: [{
          key: 'ALLOWED_TIME_SLOTS',
          value: [
            { sh: 9, sm: 0, eh: 10, em: 0 },
            { sh: 9, sm: 30, eh: 11, em: 0 },
          ],
        }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/ALLOWED_TIME_SLOTS/);
  });

  test('returns 400 when ALLOWED_TIME_SLOTS has a malformed window', async () => {
    const csrf = await getCsrfHeaders(app);

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        settings: [{ key: 'ALLOWED_TIME_SLOTS', value: [{ sh: 10, sm: 0, eh: 9, em: 0 }] }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
