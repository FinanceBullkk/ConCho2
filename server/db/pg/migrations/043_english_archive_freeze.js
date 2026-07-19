// Cutover control + database-enforced immutability for the imported English
// archive. The switch starts open and is flipped once, through the audited API.

const ARCHIVE_TABLES = [
  'eng_courses', 'eng_cohorts', 'eng_employees', 'eng_cohort_memberships',
  'eng_course_runs', 'eng_run_enrollments', 'eng_cohort_pic',
  'raw_eng_workbook_rows', 'eng_data_quality_issues',
  'eng_employee_corrections', 'eng_employee_correction_history',
  'eng_session_units', 'eng_attendance_records', 'eng_levels', 'eng_exam_results',
];

exports.up = async (knex) => {
  await knex.schema.createTable('english_archive_control', (t) => {
    t.boolean('singleton').primary().defaultTo(true);
    t.boolean('is_frozen').notNullable().defaultTo(false);
    t.timestamp('cutover_at', { useTz: true });
    t.text('frozen_by');
    t.text('reason');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE english_archive_control
    ADD CONSTRAINT ck_english_archive_singleton CHECK (singleton = true),
    ADD CONSTRAINT ck_english_archive_cutover CHECK (
      (is_frozen = false AND cutover_at IS NULL)
      OR (is_frozen = true AND cutover_at IS NOT NULL)
    )`);
  await knex('english_archive_control').insert({ singleton: true, is_frozen: false });
  await knex.raw(`
    CREATE OR REPLACE FUNCTION reject_frozen_english_archive_write()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM english_archive_control WHERE singleton = true AND is_frozen = true) THEN
        RAISE EXCEPTION 'English archive is frozen after live cutover'
          USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END;
    $$
  `);
  await knex.raw(`
    CREATE OR REPLACE FUNCTION reject_english_archive_control_reversal()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.is_frozen = true AND (
        NEW.is_frozen = false
        OR NEW.cutover_at IS DISTINCT FROM OLD.cutover_at
        OR NEW.frozen_by IS DISTINCT FROM OLD.frozen_by
        OR NEW.reason IS DISTINCT FROM OLD.reason
      ) THEN
        RAISE EXCEPTION 'English archive cutover state is immutable'
          USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await knex.raw(`CREATE TRIGGER trg_english_archive_control_immutable
    BEFORE UPDATE ON english_archive_control
    FOR EACH ROW EXECUTE FUNCTION reject_english_archive_control_reversal()`);
  for (const table of ARCHIVE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`CREATE TRIGGER trg_${table}_archive_freeze
      BEFORE INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION reject_frozen_english_archive_write()`);
  }
};

exports.down = async (knex) => {
  for (const table of ARCHIVE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP TRIGGER IF EXISTS trg_${table}_archive_freeze ON ${table}`);
  }
  await knex.raw(`DROP TRIGGER IF EXISTS trg_english_archive_control_immutable ON english_archive_control`);
  await knex.raw(`DROP FUNCTION IF EXISTS reject_english_archive_control_reversal()`);
  await knex.raw(`DROP FUNCTION IF EXISTS reject_frozen_english_archive_write()`);
  await knex.schema.dropTableIfExists('english_archive_control');
};
