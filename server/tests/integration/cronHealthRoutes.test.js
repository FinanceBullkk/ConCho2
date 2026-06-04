/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Cron Health
 * GET /api/admin/cron/health  (Admin-only)
 *
 * Also verifies the heartbeat write-side: hitting the monitored
 * pinger endpoint (POST /api/cron/reconcile) records a CronRun that
 * the health endpoint then surfaces as a healthy 'reconcile' job.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, teardown } = require('../setup');

const VALID_CRON_TOKEN = 'test-cron-token-32chars-minimum!!';

let app, tokens;

beforeAll(async () => {
  process.env.CRON_TOKEN = VALID_CRON_TOKEN;
  app = await getApp();
  tokens = getTokens();
});

afterAll(async () => {
  delete process.env.CRON_TOKEN;
  await teardown();
});

describe('GET /api/admin/cron/health — authz', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/admin/cron/health');
    expect(res.status).toBe(401);
  });

  test('403 for a non-admin (Teacher)', async () => {
    const res = await request(app)
      .get('/api/admin/cron/health')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(403);
  });

  test('200 for Admin — returns overall + jobs array', async () => {
    const res = await request(app)
      .get('/api/admin/cron/health')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('overall');
    expect(Array.isArray(res.body.data.jobs)).toBe(true);
  });
});

describe('GET /api/admin/cron/health — heartbeat after a monitored run', () => {
  test('a pinger reconcile run shows up as a healthy "reconcile" job', async () => {
    // Trigger a monitored run via the external-pinger endpoint.
    const run = await request(app)
      .post('/api/cron/reconcile')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);
    expect(run.status).toBe(200);

    const res = await request(app)
      .get('/api/admin/cron/health')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);

    const reconcile = res.body.data.jobs.find((j) => j.jobName === 'reconcile');
    expect(reconcile).toBeDefined();
    expect(reconcile.lastStatus).toBe('ok');
    expect(reconcile.health).toBe('ok');
    expect(reconcile.healthy).toBe(true);
    expect(reconcile.lastSuccessAt).toBeTruthy();
    expect(reconcile.runCount).toBeGreaterThanOrEqual(1);
    expect(reconcile.expectedIntervalMs).toBe(24 * 60 * 60 * 1000);
  });
});
