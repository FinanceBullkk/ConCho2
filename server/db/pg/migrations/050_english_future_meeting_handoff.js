// 050 — Hand future imported English Meetings to live operations.
//
// Imported raw/workbook evidence remains immutable. For planned future
// Meetings, retain the imported wall-clock timestamp as a source baseline,
// reinterpret it in the configured Vietnam timezone, and mark the occurrence
// operational so authorized commands may reschedule/cancel it with audit.

exports.up = async (knex) => {
  await knex.schema.alterTable('eng_meetings', (t) => {
    t.timestamp('source_starts_at', { useTz: true });
    t.integer('source_duration_minutes');
    t.timestamp('operational_at', { useTz: true }).index();
    t.text('operational_by');
    t.text('operational_reason');
  });
  await knex.raw(`ALTER TABLE eng_meetings
    ADD CONSTRAINT ck_eng_meeting_source_baseline CHECK (
      (source_starts_at IS NULL AND source_duration_minutes IS NULL)
      OR (source_starts_at IS NOT NULL AND source_duration_minutes > 0)
    ),
    ADD CONSTRAINT ck_eng_meeting_operational_handoff CHECK (
      (operational_at IS NULL AND operational_by IS NULL AND operational_reason IS NULL)
      OR (operational_at IS NOT NULL
        AND NULLIF(BTRIM(operational_by), '') IS NOT NULL
        AND NULLIF(BTRIM(operational_reason), '') IS NOT NULL)
    )`);

  // Preserve the workbook-derived baseline for every imported occurrence.
  await knex.raw(`UPDATE eng_meetings m SET
      source_starts_at = m.starts_at,
      source_duration_minutes = m.duration_minutes
    WHERE EXISTS (
      SELECT 1 FROM eng_session_units su
      WHERE su.meeting_id = m.id AND su.source_sheet IS NOT NULL
    )`);

  // The import encoded Vietnam wall-clock values as UTC. Adopt only future,
  // planned, attendance-free occurrences and convert them to a real instant.
  await knex.raw(`
    CREATE TEMP TABLE eng_future_meeting_handoff ON COMMIT DROP AS
    SELECT m.id,
      (m.starts_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS operational_starts_at
    FROM eng_meetings m
    WHERE m.status = 'planned'
      AND m.starts_at > NOW()
      AND EXISTS (
        SELECT 1 FROM eng_session_units su
        WHERE su.meeting_id = m.id AND su.source_sheet IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM eng_session_units su
        JOIN eng_attendance_records ar ON ar.session_unit_id = su.id
        WHERE su.meeting_id = m.id
      )
  `);
  await knex.raw(`UPDATE eng_meetings m SET
      starts_at = h.operational_starts_at,
      operational_at = NOW(),
      operational_by = 'migration:050',
      operational_reason = 'Owner-approved future imported schedule handoff',
      meta = COALESCE(m.meta, '{}'::jsonb) || jsonb_build_object(
        'endsAt', h.operational_starts_at + make_interval(mins => m.duration_minutes),
        'sourceBaselinePreserved', true
      ),
      updated_at = NOW()
    FROM eng_future_meeting_handoff h
    WHERE m.id = h.id`);
  await knex.raw(`UPDATE eng_session_units su SET
      held_at = m.starts_at,
      meta = COALESCE(su.meta, '{}'::jsonb) || jsonb_build_object(
        'endsAt', m.starts_at + make_interval(mins => m.duration_minutes),
        'futureImportHandoff', true
      ),
      updated_at = NOW()
    FROM eng_meetings m
    JOIN eng_future_meeting_handoff h ON h.id = m.id
    WHERE su.meeting_id = m.id`);
  await knex.raw(`INSERT INTO eng_audit_events (
      actor_user_id, actor_emp_code, action, entity_type, entity_key, details
    )
    SELECT NULL, 'SYSTEM', 'meeting.future_import.adopt', 'meeting', m.id,
      jsonb_build_object(
        'sourceStartsAt', m.source_starts_at,
        'operationalStartsAt', m.starts_at,
        'reason', m.operational_reason,
        'authority', 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9'
      )
    FROM eng_meetings m
    JOIN eng_future_meeting_handoff h ON h.id = m.id`);
};

exports.down = async (knex) => {
  await knex.raw(`UPDATE eng_session_units su SET held_at = m.source_starts_at
    FROM eng_meetings m
    WHERE su.meeting_id = m.id AND m.operational_by = 'migration:050'
      AND m.source_starts_at IS NOT NULL`);
  await knex.raw(`UPDATE eng_meetings SET starts_at = source_starts_at
    WHERE operational_by = 'migration:050' AND source_starts_at IS NOT NULL`);
  await knex.raw(`ALTER TABLE eng_meetings
    DROP CONSTRAINT IF EXISTS ck_eng_meeting_operational_handoff,
    DROP CONSTRAINT IF EXISTS ck_eng_meeting_source_baseline`);
  await knex.schema.alterTable('eng_meetings', (t) => {
    t.dropColumn('operational_reason');
    t.dropColumn('operational_by');
    t.dropColumn('operational_at');
    t.dropColumn('source_duration_minutes');
    t.dropColumn('source_starts_at');
  });
};
