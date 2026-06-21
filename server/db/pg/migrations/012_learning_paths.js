// Migration 012 — learning_paths (Phase 3 Wave-B: learning/path).
//
// A sequenced/curated set of LearningPrograms (the `programs` ordered text[]).
// Soft-deleted (recoverable trash); code is globally unique (Mongo `unique:true`,
// not partial — a soft-deleted path keeps its code reserved). populate('programs')
// embeds the program catalog summary — read from learning_programs at query time.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('learning_paths', (t) => {
    t.text('id').primary();
    t.text('code').notNullable();
    t.text('title').notNullable();
    t.text('description').defaultTo('');
    t.specificType('programs', 'text[]');   // ordered program ids
    t.text('status').notNullable().defaultTo('active');
    soft(t); stamps(t, knex);
  });
  // Mongo `unique:true` on code is GLOBAL (not partial) — soft-deleted keeps the code.
  await knex.raw(`CREATE UNIQUE INDEX uq_learning_paths_code ON learning_paths(code)`);
  await knex.raw(`CREATE INDEX ix_learning_paths_status_title ON learning_paths(status, title)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('learning_paths');
