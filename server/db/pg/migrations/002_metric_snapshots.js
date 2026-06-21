// Migration 002 — metric_snapshots (PG-migration Phase 3, metrics Wave-A port).
//
// Durable analytics time-series: one row per metric, per scope, per UTC day
// (the Mongo MetricSnapshot collection). analyticsSeriesService reads these back
// as trend lines; the nightly snapshot cron writes them (write-path ports later).
//
// Trap-equivalents encoded as plain SQL:
//   • text PK = Mongo ObjectId hex (per migration-001 strategy).
//   • UNIQUE (scope, COALESCE(scope_id,''), key, date) — mirrors the Mongo unique
//     index {scope,scopeId,key,date}. COALESCE so a NULL scope_id (global scope)
//     collides like Mongo (null-as-value), NOT Postgres' default null-DISTINCT
//     semantics (which would let duplicate global rows through).
//   • a plain (scope,scope_id,key,date) index = the series read access path
//     (equality on scope+scope_id+key, range on date).
//
// TTL (Mongo: ~400-day expireAfterSeconds on date) is a RETENTION concern, not
// needed to prove the read port; deferred to an app-scheduled / pg_cron delete
// alongside the AuditLog migration (plan Phase-3 unresolved question).

exports.up = async (knex) => {
  await knex.schema.createTable('metric_snapshots', (t) => {
    t.text('id').primary();
    t.timestamp('date', { useTz: true }).notNullable();   // midnight UTC of the day
    t.text('scope').notNullable();                         // global | program | office
    t.text('scope_id');                                    // null for global scope
    t.text('key').notNullable();                           // active_enrollments | completions | …
    t.double('value').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_metric_snap_series ON metric_snapshots(scope, coalesce(scope_id, ''), key, date)`);
  await knex.raw(`CREATE INDEX ix_metric_snap_read ON metric_snapshots(scope, scope_id, key, date)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('metric_snapshots');
