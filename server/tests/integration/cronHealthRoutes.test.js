/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Cron Health
 * GET /api/admin/cron/health  (Admin-only)
 *
 * Also verifies the heartbeat write-side: hitting a monitored
 * pinger endpoint (POST /api/cron/attendance-reminders) records a CronRun
 * that the health endpoint then surfaces as a healthy job.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, teardown } = require('../setup');
// D-CronRun (Phase 5 slice 5): heartbeats ride the dual-backend seam — on the
// pg lane rows land in PG only, so cleanup deletes on the ACTIVE backend.
const { deleteActiveRowsWhere } = require('../pg-test-utils');

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

  test('Admin sees configured jobs as never before first heartbeat', async () => {
    await deleteActiveRowsWhere('CronRun', {});

    const res = await request(app)
      .get('/api/admin/cron/health')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.overall).toBe('degraded');
    expect(res.body.count).toBe(5);
    const jobs = Object.fromEntries(res.body.data.jobs.map((job) => [job.jobName, job]));
    expect(jobs).toHaveProperty('attendance-reminders');
    expect(jobs).toHaveProperty('assignment-reminders');
    expect(jobs).toHaveProperty('certificate-expiry-reminders');
    expect(jobs).toHaveProperty('metric-snapshot');
    expect(jobs).toHaveProperty('retention-purge'); // Wave-E2 PG retention purge
    expect(Object.values(jobs).every((job) => job.health === 'never')).toBe(true);
    expect(Object.values(jobs).every((job) => job.runCount === 0)).toBe(true);
  });
});

describe('GET /api/admin/cron/health — heartbeat after a monitored run', () => {
  test('a pinger attendance-reminders run shows up as a healthy job', async () => {
    // Trigger a monitored run via the external-pinger endpoint.
    const run = await request(app)
      .post('/api/cron/attendance-reminders')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);
    expect(run.status).toBe(200);

    const res = await request(app)
      .get('/api/admin/cron/health')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);

    const reminders = res.body.data.jobs.find((j) => j.jobName === 'attendance-reminders');
    expect(reminders).toBeDefined();
    expect(reminders.lastStatus).toBe('ok');
    expect(reminders.health).toBe('ok');
    expect(reminders.healthy).toBe(true);
    expect(reminders.lastSuccessAt).toBeTruthy();
    expect(reminders.runCount).toBeGreaterThanOrEqual(1);
    expect(reminders.expectedIntervalMs).toBe(60 * 60 * 1000);
  });
});
