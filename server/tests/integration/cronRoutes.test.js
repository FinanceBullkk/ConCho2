/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Cron Routes
 * GET  /api/cron/health
 * POST /api/cron/reconcile
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');

const VALID_CRON_TOKEN = 'test-cron-token-32chars-minimum!!';

let app, tokens, seed;

beforeAll(async () => {
  // Set CRON_TOKEN before the app (and its caches) initialize
  process.env.CRON_TOKEN = VALID_CRON_TOKEN;

  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  delete process.env.CRON_TOKEN;
  await teardown();
});

// ── GET /api/cron/health ─────────────────────────────────
// GET is a safe method — no CSRF required.

describe('GET /api/cron/health', () => {
  test('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/cron/health');

    // cronAuth returns 401 for missing/wrong token (CRON_TOKEN is set)
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 401 with a wrong token', async () => {
    const res = await request(app)
      .get('/api/cron/health')
      .set('Authorization', 'Bearer wrong-token-value');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 200 with correct token in Authorization: Bearer header', async () => {
    const res = await request(app)
      .get('/api/cron/health')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('ts');
  });

  test('returns 200 with correct token in X-Cron-Token header', async () => {
    const res = await request(app)
      .get('/api/cron/health')
      .set('X-Cron-Token', VALID_CRON_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('ts');
  });

  test('returns 200 with correct token as query param', async () => {
    const res = await request(app)
      .get(`/api/cron/health?token=${VALID_CRON_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /api/cron/health — CRON_TOKEN unset ──────────────

describe('GET /api/cron/health — CRON_TOKEN unset', () => {
  // Temporarily unset CRON_TOKEN for this suite.
  // Capture inside beforeAll — not at describe-body time — because at
  // describe-collection time the file-level beforeAll hasn't run yet.
  let savedToken;

  beforeAll(() => {
    savedToken = process.env.CRON_TOKEN;
    delete process.env.CRON_TOKEN;
  });
  afterAll(() => {
    process.env.CRON_TOKEN = savedToken;
  });

  test('returns 503 when CRON_TOKEN env var is not set', async () => {
    const res = await request(app)
      .get('/api/cron/health')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});

// ── POST /api/cron/reconcile ─────────────────────────────
// POST /api/cron/* is exempt from CSRF (EXEMPT_PREFIXES in csrfProtection).
// Note: the CSRF middleware uses req.path which is relative to the /api
// mount point, so the actual exempt path checked is '/cron/'.

describe('POST /api/cron/reconcile', () => {
  test('returns 401 without a token', async () => {
    const res = await request(app).post('/api/cron/reconcile');

    // cronAuth kicks in before anything else; returns 401 when token missing
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 200 with a report when authenticated', async () => {
    const res = await request(app)
      .post('/api/cron/reconcile')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // reconcileService returns a report object
    expect(res.body.data).toBeDefined();
  });
});
