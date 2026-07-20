// 048 — Canonical English live meeting and attendance commands.
//
// ConMeoGauGau authority keeps a calendar occurrence (Meeting) separate from
// credited logical units. Existing imported units are backfilled one-to-one;
// new controlled commands may then create live meetings without requiring the
// workbook-only source columns.

exports.up = async (knex) => {
  await knex.schema.createTable('eng_meetings', (t) => {
    t.text('id').primary();
    t.text('course_run_id').notNullable().references('id').inTable('eng_course_runs').index();
    t.timestamp('starts_at', { useTz: true }).notNullable().index();
    t.integer('duration_minutes').notNullable();
    t.text('status').notNullable().defaultTo('planned');
    t.text('cancellation_reason');
    t.jsonb('meta');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE eng_meetings
    ADD CONSTRAINT ck_eng_meeting_duration CHECK (duration_minutes > 0),
    ADD CONSTRAINT ck_eng_meeting_status CHECK (status IN ('planned','completed','cancelled')),
    ADD CONSTRAINT ck_eng_meeting_cancel_reason CHECK (
      status <> 'cancelled' OR NULLIF(BTRIM(cancellation_reason), '') IS NOT NULL
    )`);
  await knex.raw(`CREATE UNIQUE INDEX uq_eng_meeting_run_start
    ON eng_meetings (course_run_id, starts_at)`);
  // English owns one company-wide teaching slot at a time. Configured slots do
  // not overlap, so a start-time guard is also an overlap guard.
  await knex.raw(`CREATE UNIQUE INDEX uq_eng_meeting_active_start
    ON eng_meetings (starts_at) WHERE status <> 'cancelled'`);

  await knex.schema.alterTable('eng_session_units', (t) => {
    t.text('meeting_id');
    t.integer('unit_number_in_meeting').notNullable().defaultTo(1);
    t.text('unit_type').notNullable().defaultTo('normal');
    t.text('title');
  });
  await knex.raw(`ALTER TABLE eng_session_units
    ALTER COLUMN source_sheet DROP NOT NULL,
    ALTER COLUMN source_row DROP NOT NULL`);

  await knex.raw(`INSERT INTO eng_meetings (
      id, course_run_id, starts_at, duration_minutes, status, cancellation_reason,
      meta, created_at, updated_at
    )
    SELECT 'meeting:' || su.id, su.course_run_id, su.held_at, 60,
      CASE su.status WHEN 'cancelled' THEN 'cancelled'
        WHEN 'held' THEN 'completed' ELSE 'planned' END,
      CASE WHEN su.status = 'cancelled' THEN 'Imported cancellation' END,
      jsonb_build_object('source', 'imported', 'sessionUnitId', su.id),
      su.created_at, su.updated_at
    FROM eng_session_units su`);
  await knex.raw(`UPDATE eng_session_units SET meeting_id = 'meeting:' || id`);
  await knex.raw(`ALTER TABLE eng_session_units
    ALTER COLUMN meeting_id SET NOT NULL,
    ADD CONSTRAINT fk_eng_session_unit_meeting FOREIGN KEY (meeting_id) REFERENCES eng_meetings(id),
    ADD CONSTRAINT ck_eng_session_unit_number_in_meeting CHECK (unit_number_in_meeting > 0),
    ADD CONSTRAINT ck_eng_session_unit_type CHECK (unit_type IN ('normal','final_test','makeup','admin'))`);
  await knex.raw(`ALTER TABLE eng_session_units DROP CONSTRAINT uq_eng_session_unit`);
  await knex.raw(`ALTER TABLE eng_session_units
    ADD CONSTRAINT uq_eng_session_unit_occurrence UNIQUE (course_run_id, session_number, meeting_id),
    ADD CONSTRAINT uq_eng_session_unit_meeting_number UNIQUE (meeting_id, unit_number_in_meeting)`);

  await knex.raw(`CREATE OR REPLACE FUNCTION enforce_eng_session_unit_meeting()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE meeting_run text; normal_count integer;
    BEGIN
      SELECT course_run_id INTO meeting_run FROM eng_meetings WHERE id = NEW.meeting_id;
      IF meeting_run IS NULL OR meeting_run <> NEW.course_run_id THEN
        RAISE EXCEPTION 'English Session Unit Course Run must match its Meeting';
      END IF;
      IF NEW.unit_type = 'normal' THEN
        SELECT count(*) INTO normal_count FROM eng_session_units
          WHERE meeting_id = NEW.meeting_id AND unit_type = 'normal'
            AND id <> COALESCE(NEW.id, '');
        IF normal_count >= 2 THEN
          RAISE EXCEPTION 'English Meeting cannot have more than two normal Session Units';
        END IF;
      END IF;
      RETURN NEW;
    END $$`);
  await knex.raw(`CREATE TRIGGER trg_eng_session_unit_meeting
    BEFORE INSERT OR UPDATE ON eng_session_units
    FOR EACH ROW EXECUTE FUNCTION enforce_eng_session_unit_meeting()`);

  await knex.schema.alterTable('eng_attendance_records', (t) => {
    t.text('original_status');
    t.text('entered_by');
  });
  await knex.raw(`UPDATE eng_attendance_records SET original_status = status`);
  await knex.raw(`ALTER TABLE eng_attendance_records
    ALTER COLUMN source_sheet DROP NOT NULL,
    ALTER COLUMN source_row DROP NOT NULL,
    ALTER COLUMN original_status SET NOT NULL,
    ADD CONSTRAINT ck_eng_attendance_original_status CHECK (original_status IN ('present','absent'))`);
};

exports.down = async (knex) => {
  await knex.raw('DROP TRIGGER IF EXISTS trg_eng_session_unit_meeting ON eng_session_units');
  await knex.raw('DROP FUNCTION IF EXISTS enforce_eng_session_unit_meeting()');
  await knex.raw(`UPDATE eng_attendance_records SET source_sheet = COALESCE(source_sheet, 'LIVE'),
    source_row = COALESCE(source_row, 0)`);
  await knex.raw(`ALTER TABLE eng_attendance_records
    ALTER COLUMN source_sheet SET NOT NULL, ALTER COLUMN source_row SET NOT NULL`);
  await knex.schema.alterTable('eng_attendance_records', (t) => {
    t.dropColumn('entered_by');
    t.dropColumn('original_status');
  });
  await knex.raw('ALTER TABLE eng_session_units DROP CONSTRAINT uq_eng_session_unit_meeting_number');
  await knex.raw('ALTER TABLE eng_session_units DROP CONSTRAINT uq_eng_session_unit_occurrence');
  await knex.raw('ALTER TABLE eng_session_units ADD CONSTRAINT uq_eng_session_unit UNIQUE (course_run_id, session_number)');
  await knex.raw(`UPDATE eng_session_units su SET held_at = m.starts_at,
      source_sheet = COALESCE(su.source_sheet, 'LIVE'), source_row = COALESCE(su.source_row, 0)
    FROM eng_meetings m WHERE m.id = su.meeting_id`);
  await knex.raw(`ALTER TABLE eng_session_units
    ALTER COLUMN source_sheet SET NOT NULL, ALTER COLUMN source_row SET NOT NULL`);
  await knex.raw('ALTER TABLE eng_session_units DROP CONSTRAINT fk_eng_session_unit_meeting');
  await knex.schema.alterTable('eng_session_units', (t) => {
    t.dropColumn('meeting_id');
    t.dropColumn('unit_number_in_meeting');
    t.dropColumn('unit_type');
    t.dropColumn('title');
  });
  await knex.schema.dropTableIfExists('eng_meetings');
};
