// Migration 035 — cron_runs (Phase 5 cutover: CronRun heartbeat, D-CronRun).
//
// PG twin of models/CronRun — one row per monitored job (unique job_name),
// upserted by lib/cronMonitor.js recordStart/recordEnd via the
// lib/cron-run-repository seam; read whole by the admin cron-health endpoint.
// NOT a lock and NOT TTL'd / soft-deleted: a small fixed-size ops table whose
// whole point is durable last-run state — so it is NOT in retentionPurgeJob's
// windows. (An advisory lock was considered and rejected: CronRun is never
// used for mutual exclusion — it is queryable, restart-surviving state.)
//
// Fidelity notes:
//   • upsert keys on job_name (⇔ the Mongo unique jobName index); `id` stays
//     the PK (ObjectId-hex) so the test auto-mirror / readActiveRow keep
//     working by id, same convention as every migrated table (mig 033).
//   • expected_interval_ms is bigint for headroom (a monthly cadence
//     overflows int4); node-pg returns bigint as string → the pg impl casts
//     Number() on read, same convention as helpers/counter.js.

exports.up = async (knex) => {
  await knex.schema.createTable('cron_runs', (t) => {
    t.text('id').primary();                    // ObjectId-hex shaped, ⇔ mig 033
    t.text('job_name').notNullable().unique(); // ⇔ Mongo unique jobName index
    t.text('last_status').notNullable().defaultTo('running'); // 'running'|'ok'|'error'
    t.timestamp('last_started_at', { useTz: true });
    t.timestamp('last_run_at', { useTz: true });
    t.timestamp('last_success_at', { useTz: true });
    t.integer('last_duration_ms').notNullable().defaultTo(0);
    t.text('last_error');
    t.integer('run_count').notNullable().defaultTo(0);
    t.integer('fail_count').notNullable().defaultTo(0);
    t.bigInteger('expected_interval_ms');      // null = cadence unknown (no staleness check)
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  // No extra index: the only read is a full scan of ≤ ~10 rows ordered by
  // job_name (the unique index already covers that sort).
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('cron_runs');
};
