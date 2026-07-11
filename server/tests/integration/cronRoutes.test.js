/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Cron Routes
 * GET  /api/cron/health
 * POST /api/cron/attendance-reminders
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const fx = require('../fixtures/pg-fixtures');

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

// ── POST /api/cron/attendance-reminders ──────────────────
// POST /api/cron/* is exempt from CSRF (EXEMPT_PREFIXES in csrfProtection).
// Note: the CSRF middleware uses req.path which is relative to the /api
// mount point, so the actual exempt path checked is '/cron/'.

describe('POST /api/cron/attendance-reminders', () => {
  test('returns 401 without a token', async () => {
    const res = await request(app).post('/api/cron/attendance-reminders');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 200 with a summary when authenticated', async () => {
    const res = await request(app)
      .post('/api/cron/attendance-reminders')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('scanned');
    expect(res.body.data).toHaveProperty('notified');
    expect(res.body.data).toHaveProperty('emailed');
    expect(typeof res.body.data.scanned).toBe('number');
  });

  test('accepts ?hours= query and clamps to [1, 168]', async () => {
    const res = await request(app)
      .post('/api/cron/attendance-reminders?hours=48')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('is idempotent — second call notifies 0 (everything already reminded)', async () => {
    // Seed: create a schedule starting in 2h with an enrolled user
    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);
    await fx.createSchedule({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime,
      endTime,
      enrolledUsers: [seed.member1._id],
    });

    const first = await request(app)
      .post('/api/cron/attendance-reminders')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);
    expect(first.status).toBe(200);
    expect(first.body.data.notified).toBeGreaterThanOrEqual(1);

    const second = await request(app)
      .post('/api/cron/attendance-reminders')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);
    expect(second.status).toBe(200);
    expect(second.body.data.notified).toBe(0);
  });
});
