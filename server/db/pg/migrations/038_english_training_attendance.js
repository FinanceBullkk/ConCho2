// 038 — English Training Phase 2: session units + imported attendance.
// These tables remain separate from legacy schedules/attendances: English
// employees are business records and do not require ConCho2 login accounts.

const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('eng_session_units', (t) => {
    t.text('id').primary();
    t.text('course_run_id').notNullable().references('id').inTable('eng_course_runs').index();
    t.integer('session_number').notNullable();
    t.timestamp('held_at', { useTz: true }).notNullable().index();
    t.text('status').notNullable();
    t.text('source_sheet').notNullable();
    t.integer('source_row').notNullable();
    t.jsonb('meta');
    stamps(t, knex);
  });
  await knex.raw(`ALTER TABLE eng_session_units
    ADD CONSTRAINT uq_eng_session_unit UNIQUE (course_run_id, session_number),
    ADD CONSTRAINT ck_eng_session_number CHECK (session_number >= 1),
    ADD CONSTRAINT ck_eng_session_status CHECK (status IN ('scheduled','held','cancelled'))`);

  await knex.schema.createTable('eng_attendance_records', (t) => {
    t.text('id').primary();
    t.text('session_unit_id').notNullable().references('id').inTable('eng_session_units').index();
    t.text('run_enrollment_id').notNullable().references('id').inTable('eng_run_enrollments').index();
    t.text('status').notNullable();
    t.boolean('source_enrollment_dropped').notNullable().defaultTo(false);
    t.text('source_sheet').notNullable();
    t.integer('source_row').notNullable();
    t.jsonb('meta');
    stamps(t, knex);
  });
  await knex.raw(`ALTER TABLE eng_attendance_records
    ADD CONSTRAINT uq_eng_attendance_record UNIQUE (session_unit_id, run_enrollment_id),
    ADD CONSTRAINT ck_eng_attendance_status CHECK (status IN ('present','absent'))`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('eng_attendance_records');
  await knex.schema.dropTableIfExists('eng_session_units');
};

