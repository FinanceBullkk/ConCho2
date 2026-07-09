const { deriveHealth, STALE_FACTOR, CRON_JOBS } = require('../../lib/cronMonitor');

// deriveHealth is pure — no DB. Exercises the staleness/health verdict logic
// the admin /api/admin/cron/health endpoint relies on.

const HOUR = 60 * 60 * 1000;
const now = Date.now();

describe('cronMonitor.deriveHealth', () => {
  test('ok — recent success within the expected window', () => {
    const run = {
      lastStatus: 'ok',
      lastSuccessAt: new Date(now - HOUR), // 1h ago, interval 24h
      expectedIntervalMs: 24 * HOUR,
    };
    const v = deriveHealth(run, now);
    expect(v.health).toBe('ok');
    expect(v.healthy).toBe(true);
    expect(v.stale).toBe(false);
  });

  test('stale — last success older than STALE_FACTOR × interval', () => {
    const run = {
      lastStatus: 'ok',
      // older than 2 × 24h
      lastSuccessAt: new Date(now - (STALE_FACTOR * 24 * HOUR + HOUR)),
      expectedIntervalMs: 24 * HOUR,
    };
    const v = deriveHealth(run, now);
    expect(v.health).toBe('stale');
    expect(v.stale).toBe(true);
    expect(v.healthy).toBe(false);
  });

  test('error — latest run threw, regardless of past success', () => {
    const run = {
      lastStatus: 'error',
      lastSuccessAt: new Date(now - HOUR),
      expectedIntervalMs: 24 * HOUR,
    };
    const v = deriveHealth(run, now);
    expect(v.health).toBe('error');
    expect(v.healthy).toBe(false);
  });

  test('never — has never succeeded and is not in error', () => {
    const run = { lastStatus: 'running', lastSuccessAt: null, expectedIntervalMs: 24 * HOUR };
    const v = deriveHealth(run, now);
    expect(v.health).toBe('never');
    expect(v.healthy).toBe(false);
  });

  test('no expectedIntervalMs — never marked stale (cadence unknown)', () => {
    const run = {
      lastStatus: 'ok',
      lastSuccessAt: new Date(now - 1000 * 24 * HOUR), // ancient
      expectedIntervalMs: null,
    };
    const v = deriveHealth(run, now);
    expect(v.stale).toBe(false);
    expect(v.health).toBe('ok');
    expect(v.staleThresholdMs).toBeNull();
  });

  test('CRON_JOBS exposes stable slugs + cadences for both jobs', () => {
    expect(CRON_JOBS.reminders).toMatchObject({ jobName: 'attendance-reminders' });
    expect(CRON_JOBS.reminders.expectedIntervalMs).toBe(HOUR);
    expect(CRON_JOBS.assignmentReminders).toMatchObject({ jobName: 'assignment-reminders' });
    expect(CRON_JOBS.assignmentReminders.expectedIntervalMs).toBe(24 * HOUR);
  });

  // OPS-010: every job must carry a crontab schedule so PINGER-driven runs
  // upsert the Sentry monitor config — a schedule-less monitor can never
  // fire "missed run" alerts. Cadences mirror docs/cron-pinger-setup.md.
  test('CRON_JOBS entries carry valid crontab schedules (OPS-010)', () => {
    const cron = require('node-cron');
    expect(CRON_JOBS.reminders.schedule).toBe('0 * * * *');
    expect(CRON_JOBS.assignmentReminders.schedule).toBe('0 1 * * *');
    for (const job of Object.values(CRON_JOBS)) {
      expect(cron.validate(job.schedule)).toBe(true);
    }
  });
});
