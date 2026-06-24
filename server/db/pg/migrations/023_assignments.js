// Migration 023 — assignments (Phase 3 Wave-B: learning/assignment).
//
// Required-training assignments (Wave D4): a single program|path target, due by
// dueDate, aimed at users and/or departments (text[] multikey). Soft-deleted
// (archive = status 'archived' + is_deleted true + deleted_at). Encodes the
// load-bearing Mongo trap-equivalents as plain SQL:
//   • user_ids / department_ids = text[] (Mongo multikey arrays → `= ANY(col)`).
//   • partial-unique source_certificate_id WHERE NOT NULL — the recert loop's
//     idempotency backstop (Mongo partialFilterExpression {sourceCertificateId:
//     {$type:'objectId'}} = "one auto-recert assignment EVER per certificate";
//     null = a normal assignment, exempt).
//   • single-target XOR invariant (Mongo pre('validate') ensureSingleTarget) → a
//     CHECK: program target ⇒ program_id set & path_id null; path target ⇒ inverse.
//
// FK constraints deferred (project-wide: Mongo never enforced them) — FK-column
// indexes only, mirroring the Mongo {status,dueDate}/{programId,status}/{pathId,
// status} indexes for the list + targeted reads.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('assignments', (t) => {
    t.text('id').primary();
    t.text('title').notNullable();
    t.text('description').defaultTo('');
    t.text('target_type').notNullable();              // program | path
    t.text('program_id');                             // set ⇔ target_type='program'
    t.text('path_id');                                // set ⇔ target_type='path'
    t.timestamp('due_date', { useTz: true }).notNullable();
    t.specificType('user_ids', 'text[]');             // multikey audience (users)
    t.specificType('department_ids', 'text[]');       // multikey audience (departments)
    t.text('status').notNullable().defaultTo('active'); // active | archived
    t.text('created_by');
    t.text('source_certificate_id');                  // set ⇒ auto-recert assignment
    soft(t); stamps(t, knex);
  });

  await knex.raw(`CREATE INDEX ix_assignments_status_due ON assignments(status, due_date)`);
  await knex.raw(`CREATE INDEX ix_assignments_program_status ON assignments(program_id, status)`);
  await knex.raw(`CREATE INDEX ix_assignments_path_status ON assignments(path_id, status)`);
  // One auto-recert assignment EVER per certificate (Mongo partial unique).
  await knex.raw(
    `CREATE UNIQUE INDEX uq_assignments_source_cert ON assignments(source_certificate_id) WHERE source_certificate_id IS NOT NULL`,
  );
  // Single-target XOR invariant (Mongo pre('validate') ensureSingleTarget).
  await knex.raw(`ALTER TABLE assignments ADD CONSTRAINT ck_assignments_single_target CHECK (
    (target_type = 'program' AND program_id IS NOT NULL AND path_id IS NULL) OR
    (target_type = 'path'    AND path_id    IS NOT NULL AND program_id IS NULL))`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('assignments');
