/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — cron-run heartbeat (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * lib/cron-run-repository — the CronRun heartbeat seam (D-CronRun, Phase 5
 * slice 5). Runs only when a Postgres URL is present; SKIPS otherwise.
 * Asserts identical behaviour + traps:
 *   • upsertStart on an empty backend inserts a 'running' row with zeroed
 *     counters ($setOnInsert ⇔ ON CONFLICT insert branch + column defaults)
 *   • a full ok cycle stamps lastRunAt=lastSuccessAt, runCount 1
 *   • an error run PRESERVES lastSuccessAt (conditional-$set ⇔ COALESCE),
 *     sets lastError, bumps failCount; a later ok run CLEARS lastError
 *   • upsertEnd without a prior start still creates the row (pinger can hit
 *     a wiped table) with runCount 1
 *   • findAllRuns: identical camelCase shape, jobName-sorted, and feeding
 *     both backends' rows through deriveHealth yields identical verdicts
 *     (expectedIntervalMs must come back a NUMBER — bigint string trap)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const { impls } = require('../../lib/cron-run-repository');
const { deriveHealth } = require('../../lib/cronMonitor');
const CronRun = require('../../models/CronRun');

const DAY_MS = 24 * 60 * 60 * 1000;

describePg('PG-parity: cron-run repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await query('TRUNCATE cron_runs');
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(impls.mongo), fn(impls.pg)]);

  // Normalized row readers (middleware-free on both backends).
  const mongoRow = (jobName) => CronRun.findOne({ jobName }).lean();
  const pgRow = async (jobName) => {
    const { rows } = await query('SELECT * FROM cron_runs WHERE job_name = $1', [jobName]);
    return rows[0];
  };

  test('fresh upsertStart inserts a running row with zeroed counters — identical', async () => {
    const t0 = new Date('2026-07-08T01:00:00.000Z');
    await both((r) => r.upsertStart('reconcile', t0));

    const m = await mongoRow('reconcile');
    const p = await pgRow('reconcile');
    expect(m.lastStatus).toBe('running');
    expect(p.last_status).toBe('running');
    expect(new Date(m.lastStartedAt).toISOString()).toBe(t0.toISOString());
    expect(new Date(p.last_started_at).toISOString()).toBe(t0.toISOString());
    expect(m.runCount).toBe(0);
    expect(p.run_count).toBe(0);
    expect(m.lastSuccessAt).toBeNull();
    expect(p.last_success_at).toBeNull();
    expect(m.lastDurationMs).toBe(0);
    expect(p.last_duration_ms).toBe(0);
  });

  test('full ok cycle stamps lastRunAt = lastSuccessAt, runCount 1 — identical', async () => {
    const t1 = new Date('2026-07-08T01:00:05.000Z');
    await both((r) => r.upsertEnd('reconcile', {
      status: 'ok', finishedAt: t1, durationMs: 5000, error: null, expectedIntervalMs: DAY_MS,
    }));

    const m = await mongoRow('reconcile');
    const p = await pgRow('reconcile');
    for (const [status, runAt, successAt, dur, run, fail, interval] of [
      [m.lastStatus, m.lastRunAt, m.lastSuccessAt, m.lastDurationMs, m.runCount, m.failCount, m.expectedIntervalMs],
      [p.last_status, p.last_run_at, p.last_success_at, p.last_duration_ms, p.run_count, p.fail_count, Number(p.expected_interval_ms)],
    ]) {
      expect(status).toBe('ok');
      expect(new Date(runAt).toISOString()).toBe(t1.toISOString());
      expect(new Date(successAt).toISOString()).toBe(t1.toISOString());
      expect(dur).toBe(5000);
      expect(run).toBe(1);
      expect(fail).toBe(0);
      expect(interval).toBe(DAY_MS);
    }
  });

  test('error run preserves lastSuccessAt + sets lastError; later ok clears it — identical', async () => {
    const tOk = new Date('2026-07-08T01:00:05.000Z'); // success stamp from the previous test
    const tErr = new Date('2026-07-08T02:00:00.000Z');
    await both((r) => r.upsertStart('reconcile', tErr));
    await both((r) => r.upsertEnd('reconcile', {
      status: 'error', finishedAt: tErr, durationMs: 10, error: 'boom', expectedIntervalMs: DAY_MS,
    }));

    let m = await mongoRow('reconcile');
    let p = await pgRow('reconcile');
    expect(m.lastStatus).toBe('error');
    expect(p.last_status).toBe('error');
    expect(m.lastError).toBe('boom');
    expect(p.last_error).toBe('boom');
    // The success stamp must NOT move on an error run (conditional-$set ⇔ COALESCE)
    expect(new Date(m.lastSuccessAt).toISOString()).toBe(tOk.toISOString());
    expect(new Date(p.last_success_at).toISOString()).toBe(tOk.toISOString());
    expect(m.runCount).toBe(2);
    expect(p.run_count).toBe(2);
    expect(m.failCount).toBe(1);
    expect(p.fail_count).toBe(1);

    // A subsequent ok run clears the error (direct-assign ⇔ $set null)
    const tOk2 = new Date('2026-07-08T03:00:00.000Z');
    await both((r) => r.upsertEnd('reconcile', {
      status: 'ok', finishedAt: tOk2, durationMs: 20, error: null, expectedIntervalMs: DAY_MS,
    }));
    m = await mongoRow('reconcile');
    p = await pgRow('reconcile');
    expect(m.lastError).toBeNull();
    expect(p.last_error).toBeNull();
    expect(new Date(m.lastSuccessAt).toISOString()).toBe(tOk2.toISOString());
    expect(new Date(p.last_success_at).toISOString()).toBe(tOk2.toISOString());
    expect(m.runCount).toBe(3);
    expect(p.run_count).toBe(3);
    expect(m.failCount).toBe(1);
    expect(p.fail_count).toBe(1);
  });

  test('upsertEnd without a prior start creates the row (wiped-table pinger) — identical', async () => {
    const t = new Date('2026-07-08T04:00:00.000Z');
    await both((r) => r.upsertEnd('attendance-reminders', {
      status: 'error', finishedAt: t, durationMs: 7, error: 'cold start', expectedIntervalMs: null,
    }));

    const m = await mongoRow('attendance-reminders');
    const p = await pgRow('attendance-reminders');
    expect(m.runCount).toBe(1);
    expect(p.run_count).toBe(1);
    expect(m.failCount).toBe(1);
    expect(p.fail_count).toBe(1);
    expect(m.expectedIntervalMs).toBeNull();
    expect(p.expected_interval_ms).toBeNull();
    expect(m.lastStartedAt).toBeNull();
    expect(p.last_started_at).toBeNull();
  });

  test('findAllRuns: identical shape, jobName order, and deriveHealth verdicts', async () => {
    // Seed a third job out of alphabetical order.
    await both((r) => r.upsertStart('metric-snapshot', new Date('2026-07-08T05:00:00.000Z')));

    const [mRuns, pRuns] = await both((r) => r.findAllRuns());
    expect(pRuns.map((r) => r.jobName)).toEqual(mRuns.map((r) => r.jobName));
    expect(mRuns.map((r) => r.jobName)).toEqual(
      ['attendance-reminders', 'metric-snapshot', 'reconcile'],
    );

    const FIELDS = ['jobName', 'lastStatus', 'lastDurationMs', 'lastError', 'runCount', 'failCount', 'expectedIntervalMs'];
    const now = new Date('2026-07-08T06:00:00.000Z').getTime();
    mRuns.forEach((mRun, i) => {
      const pRun = pRuns[i];
      for (const f of FIELDS) expect(pRun[f]).toEqual(mRun[f] ?? null);
      // bigint trap: the PG impl must hand deriveHealth a NUMBER cadence
      if (pRun.expectedIntervalMs != null) expect(typeof pRun.expectedIntervalMs).toBe('number');
      expect(deriveHealth(pRun, now)).toEqual(deriveHealth(mRun, now));
    });
  });
});
