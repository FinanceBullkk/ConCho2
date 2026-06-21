// Migration 005 — session_types (PG-migration Phase 3 Wave-B: session-type catalog).
//
// Metadata-only taxonomy of session kinds (Workshop/Coaching/Exam) with display +
// prefill hints. NEVER participates in slot/room/conflict logic. Soft-deleted so
// archiving a type keeps it on historical sessions; `display_order` drives the
// list sequence. (`order` is a SQL reserved word → column is `display_order`.)

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('session_types', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('color').defaultTo('#6366f1');
    t.integer('default_duration_min').defaultTo(60);
    t.integer('default_capacity');
    t.integer('display_order').notNullable().defaultTo(0);
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_session_types_live_order ON session_types(is_deleted, display_order)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('session_types');
