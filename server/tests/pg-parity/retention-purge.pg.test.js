/**
 * ──────────────────────────────────────────────────────────
 * PG retention purge (Phase 3 Wave-E slice E2)
 * ──────────────────────────────────────────────────────────
 * jobs/retentionPurgeJob.purgeExpiredRows — the PG stand-in for Mongo's TTL
 * indexes (PG has no native TTL; debt deferred to Wave E by migs 002/019/029).
 * PG-only by nature: the Mongo half of this behavior IS the TTL index
 * declarations on the models (mongod's TTL sweeper can't be exercised in a
 * fast test — ~60s cadence), so parity is pinned structurally instead:
 * the job's windows must match each model's env var + default, field-for-field.
 * Runs only when a Postgres URL is present (the pg-parity CI job); SKIPS
 * otherwise. No Mongo/mongod needed.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const { purgeExpiredRows, retentionWindows } = require('../../jobs/retentionPurgeJob');

const hex = (n) => n.toString(16).padStart(24, '0');

// Insert one row aged `days` back per purge-managed table. Minimal NOT NULL
// column sets from migs 029 / 019 / 002.
const seedAged = async (idBase, days) => {
  await query(
    `INSERT INTO audit_log(id, actor_role, action, entity, created_at)
     VALUES ($1, 'System', 'created', 'User', now() - make_interval(days => $2))`,
    [hex(idBase), days]
  );
  await query(
    `INSERT INTO notification_logs(id, type, cadence_key, status, created_at)
     VALUES ($1, 'test', $2, 'sent', now() - make_interval(days => $3))`,
    [hex(idBase + 1), `cad-${idBase}`, days]
  );
  await query(
    `INSERT INTO metric_snapshots(id, date, scope, key, value)
     VALUES ($1, now() - make_interval(days => $2), 'global', $3, 1)`,
    [hex(idBase + 2), days, `key-${idBase}`]
  );
};

const countAll = async () => {
  const counts = {};
  for (const { table } of retentionWindows()) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM ${table}`);
    counts[table] = rows[0].n;
  }
  return counts;
};

describePg('pg retention purge (Mongo TTL stand-in)', () => {
  beforeEach(async () => {
    await query('TRUNCATE audit_log, notification_logs, metric_snapshots, token_blocklist');
  });

  afterAll(async () => {
    await closePool();
  });

  test('windows mirror the Mongo TTL definitions (env + default lockstep)', () => {
    const byTable = Object.fromEntries(retentionWindows().map((w) => [w.table, w]));
    // Same defaults as models/AuditLog, models/NotificationLog, models/MetricSnapshot.
    expect(byTable.audit_log).toMatchObject({ column: 'created_at', days: 730 });
    expect(byTable.notification_logs).toMatchObject({ column: 'created_at', days: 180 });
    expect(byTable.metric_snapshots).toMatchObject({ column: 'date', days: 400 });
    // TTL expireAfterSeconds: 0 ⇔ delete as soon as expires_at < now (mig 033).
    expect(byTable.token_blocklist).toMatchObject({ column: 'expires_at', days: 0 });
  });

  test('deletes rows past each window, keeps rows inside it', async () => {
    // Expired: 1 day past each table's window. Fresh: well inside every window.
    await seedAged(0xf10, 731);   // past audit_log 730
    await seedAged(0xf20, 401);   // past metric_snapshots 400 (audit/notification rows stay)
    await seedAged(0xf30, 181);   // past notification_logs 180 (audit row stays)
    await seedAged(0xf40, 10);    // fresh everywhere

    // token_blocklist's window is "the JWT itself has expired" (expires_at < now).
    await query(
      `INSERT INTO token_blocklist(id, jti, expires_at)
       VALUES ($1, 'jti-expired', now() - interval '1 hour'),
              ($2, 'jti-live',    now() + interval '1 hour')`,
      [hex(0xf41), hex(0xf42)]
    );

    const deleted = await purgeExpiredRows();

    expect(deleted).toEqual({
      audit_log: 1,           // only the 731d row
      notification_logs: 3,   // 731d + 401d + 181d rows
      metric_snapshots: 2,    // 731d + 401d rows
      token_blocklist: 1,     // only the already-expired JTI
    });
    expect(await countAll()).toEqual({
      audit_log: 3,
      notification_logs: 1,
      metric_snapshots: 2,
      token_blocklist: 1,
    });
  });

  test('boundary: a row exactly AT the window edge survives (strict <)', async () => {
    // Insert at now() - window + 1 minute margin → inside; purge keeps it.
    await query(
      `INSERT INTO audit_log(id, actor_role, action, entity, created_at)
       VALUES ($1, 'System', 'created', 'User',
               now() - make_interval(days => 730) + interval '1 minute')`,
      [hex(0xf51)]
    );
    const deleted = await purgeExpiredRows();
    expect(deleted.audit_log).toBe(0);
    expect((await countAll()).audit_log).toBe(1);
  });

  test('env override applies at call time (AUDIT_RETENTION_DAYS)', async () => {
    const prev = process.env.AUDIT_RETENTION_DAYS;
    try {
      await seedAged(0xf60, 30);
      process.env.AUDIT_RETENTION_DAYS = '7';
      const deleted = await purgeExpiredRows();
      expect(deleted.audit_log).toBe(1); // 30d-old row now past the 7d window
    } finally {
      if (prev === undefined) delete process.env.AUDIT_RETENTION_DAYS;
      else process.env.AUDIT_RETENTION_DAYS = prev;
    }
  });

  test('empty tables purge to zero deletions', async () => {
    expect(await purgeExpiredRows()).toEqual({
      audit_log: 0,
      notification_logs: 0,
      metric_snapshots: 0,
      token_blocklist: 0,
    });
  });
});
