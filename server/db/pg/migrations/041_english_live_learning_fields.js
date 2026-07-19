// 041 — Typed English policy and live delivery context on the generic spine.
// No live English table is introduced: Program, Class/Cohort and Enrollment
// remain the write aggregates.

exports.up = async (knex) => {
  await knex.schema.alterTable('learning_programs', (t) => {
    t.jsonb('english_policy');
  });
  await knex.schema.alterTable('classes', (t) => {
    t.text('english_group_code').index();
    t.jsonb('english_policy_snapshot');
    t.text('english_pic_display');
    t.date('start_date');
    t.date('end_date');
  });
  await knex.raw(`ALTER TABLE classes
    ADD CONSTRAINT ck_classes_english_dates
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)`);
  await knex.raw(`CREATE UNIQUE INDEX uq_classes_english_run_code_active
    ON classes (class_code) WHERE is_deleted = false AND english_group_code IS NOT NULL`);

  await knex.schema.alterTable('enrollments', (t) => {
    t.integer('start_session_number');
  });
  await knex.raw(`ALTER TABLE enrollments
    ADD CONSTRAINT ck_enrollments_start_session
    CHECK (start_session_number IS NULL OR start_session_number >= 1)`);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_classes_english_run_code_active');
  await knex.schema.alterTable('enrollments', (t) => t.dropColumn('start_session_number'));
  await knex.schema.alterTable('classes', (t) => {
    t.dropColumn('english_group_code');
    t.dropColumn('english_policy_snapshot');
    t.dropColumn('english_pic_display');
    t.dropColumn('start_date');
    t.dropColumn('end_date');
  });
  await knex.schema.alterTable('learning_programs', (t) => t.dropColumn('english_policy'));
};
