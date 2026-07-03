// 029 — audit_log (Phase 3 Wave-E slice E1: audit write-path port).
//
// Mirrors models/AuditLog.js. Append-only: NO soft-delete, NO updated_at.
// The tamper-evident hash chain (seq + prev_hash + hash) is written by
// services/auditService.js through the serialized in-process queue; the
// partial-unique seq index below is the DB-level fork guard on this backend,
// exactly like the Mongo partial index ({seq:{$exists:true}}).
//
// Retention: Mongo uses a 730d TTL index; PG has no native TTL — the nightly
// retention purge job (Wave-E slice E2) DELETEs by created_at. The plain
// created_at index below serves that purge + chain-order scans.
//
// entity/actor_role enums are NOT CHECK constraints on purpose: the Mongo enum
// is a growing ratchet (see the AuditLog model comment); both backends enforce
// it app-side from the SAME schema enumValues (services/audit-repository.pg.js)
// so extending the list stays a one-file change.

exports.up = async (knex) => {
  await knex.schema.createTable('audit_log', (t) => {
    t.text('id').primary();

    // Who acted (nullable → system jobs write actor_id NULL + role 'System').
    t.text('actor_id');
    t.text('actor_role').notNullable();
    t.text('actor_emp_code');

    // What happened.
    t.text('action').notNullable();
    t.text('entity').notNullable();
    t.text('entity_id');

    // {before, after} snapshot, sensitive fields pre-redacted by the service.
    t.jsonb('diff');

    // Request correlation context.
    t.text('request_id');
    t.text('ip');
    t.text('user_agent');

    t.text('note');

    // Tamper-evident hash chain. seq nullable: chained rows always carry it,
    // but the ETL may import pre-chain legacy Mongo rows without one.
    t.bigInteger('seq');
    t.text('prev_hash');
    t.text('hash');

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Chain fork guard — same contract as Mongo's partial-unique {seq:1}.
  await knex.raw(
    `CREATE UNIQUE INDEX uq_audit_log_seq ON audit_log(seq) WHERE seq IS NOT NULL`
  );
  // Hot path: "everything that happened to entity X, newest first".
  await knex.raw(
    `CREATE INDEX ix_audit_log_entity ON audit_log(entity, entity_id, created_at DESC)`
  );
  // "Everything actor Y did."
  await knex.raw(
    `CREATE INDEX ix_audit_log_actor ON audit_log(actor_id, created_at DESC)`
  );
  // Audit-log filter "?action=" with the mandatory newest-first sort.
  await knex.raw(
    `CREATE INDEX ix_audit_log_action ON audit_log(action, created_at DESC)`
  );
  // Retention purge (E2) + chronological scans.
  await knex.raw(`CREATE INDEX ix_audit_log_created ON audit_log(created_at)`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('audit_log');
};
