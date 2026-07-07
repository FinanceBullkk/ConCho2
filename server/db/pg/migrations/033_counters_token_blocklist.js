// Migration 033 — counters + token_blocklist (Phase 5 cutover-blocker slice 2).
//
// counters: the PG twin of models/Counter — one row per named sequence
// (certificate numbering, empCode, classCode). NOT a PG SEQUENCE: sequences
// are non-transactional (a rolled-back issuance burns a number), while the
// Mongo `findOneAndUpdate $inc` the app relies on is gapless-per-commit. A
// plain row + `INSERT … ON CONFLICT DO UPDATE seq = seq + 1 RETURNING seq`
// keeps those semantics (owner decision 2026-07-07: gapless). No timestamps —
// the Mongo model has none.
//
// token_blocklist: the PG twin of models/TokenBlocklist — revoked JWT JTIs so
// auth middleware rejects them while still cryptographically valid (SECURITY:
// without it, revoked/rotated tokens stay valid on the PG backend). Mongo's
// TTL index (expireAfterSeconds: 0 on expiresAt) becomes a retention window in
// jobs/retentionPurgeJob (expires_at < now, days => 0) — same E2 pattern as
// audit_log/notification_logs. `jti` unique = the Mongo unique index; the
// upsert writer relies on ON CONFLICT (jti) DO NOTHING for double-logout no-op.

exports.up = async (knex) => {
  await knex.schema.createTable('counters', (t) => {
    // PK column is `id` (the counter NAME — Mongo Counter._id, e.g.
    // 'certificateNumber'), NOT `key`: every migrated table keys on `id`, and
    // the test auto-mirror / ETL / readActiveRow all upsert-delete by `id` —
    // a differently-named PK would break the Mongoose-fixture mirror.
    t.text('id').primary();
    t.bigInteger('seq').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('token_blocklist', (t) => {
    t.text('id').primary();                        // ObjectId-hex, same as every migrated table
    t.text('jti').notNullable().unique();
    t.text('user_id');
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.text('reason').notNullable().defaultTo('logout');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  // Purge-window scan (retentionPurgeJob deletes expires_at < now()).
  await knex.raw('CREATE INDEX ix_token_blocklist_expires_at ON token_blocklist(expires_at)');
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('token_blocklist');
  await knex.schema.dropTableIfExists('counters');
};
