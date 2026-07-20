// 045 — Persistent, recoverable time correction for imported English sessions.
//
// The raw workbook remains immutable. The current overlay is keyed by a stable
// class/course/run/session natural key so it survives a disposable re-import;
// each application also records an append-only batch summary.

const ARCHIVE_CORRECTION_TABLES = [
  'eng_session_time_correction_batches',
  'eng_session_time_corrections',
];

exports.up = async (knex) => {
  await knex.schema.createTable('eng_session_time_correction_batches', (t) => {
    t.text('id').primary();
    t.text('reason').notNullable();
    t.text('corrected_by').notNullable();
    t.jsonb('summary').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('eng_session_time_corrections', (t) => {
    t.text('natural_key').primary();
    t.text('class_code').notNullable().index();
    t.text('course_run_key').notNullable().index();
    t.integer('session_number').notNullable();
    t.timestamp('original_held_at', { useTz: true }).notNullable();
    t.timestamp('corrected_held_at', { useTz: true }).notNullable().index();
    t.text('slot_label').notNullable();
    t.boolean('moved_date').notNullable();
    t.text('reason').notNullable();
    t.text('corrected_by').notNullable();
    t.text('batch_id').notNullable()
      .references('id').inTable('eng_session_time_correction_batches');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE eng_session_time_corrections
    ADD CONSTRAINT ck_eng_session_time_correction_number CHECK (session_number >= 1),
    ADD CONSTRAINT ck_eng_session_time_correction_changed CHECK (original_held_at <> corrected_held_at)`);

  // Migration 043 created the shared freeze function before these later tables
  // existed. Give both correction tables the same one-way Archive protection.
  for (const table of ARCHIVE_CORRECTION_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`CREATE TRIGGER trg_${table}_archive_freeze
      BEFORE INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION reject_frozen_english_archive_write()`);
  }
};

exports.down = async (knex) => {
  for (const table of [...ARCHIVE_CORRECTION_TABLES].reverse()) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP TRIGGER IF EXISTS trg_${table}_archive_freeze ON ${table}`);
  }
  await knex.raw(`ALTER TABLE eng_session_time_corrections
    DROP CONSTRAINT IF EXISTS ck_eng_session_time_correction_changed,
    DROP CONSTRAINT IF EXISTS ck_eng_session_time_correction_number`);
  await knex.schema.dropTableIfExists('eng_session_time_corrections');
  await knex.schema.dropTableIfExists('eng_session_time_correction_batches');
};
