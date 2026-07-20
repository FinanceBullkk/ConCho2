// 047 — Make the English domain canonical in-app.
//
// ConMeoGauGau is the business authority: Cohort is the stable class, PIC is a
// dated ownership assignment (employee or label), Course Run owns the roster,
// and one employee may have at most one active Run Enrollment. The earlier
// generic Program/Class/PIC-Team handoff remains reversible data and is retired
// by an operator script after this schema is verified.

const LIVE_TABLES = [
  'eng_courses', 'eng_cohorts', 'eng_employees', 'eng_cohort_memberships',
  'eng_course_runs', 'eng_run_enrollments', 'eng_cohort_pic',
  'eng_employee_corrections', 'eng_employee_correction_history',
  'eng_session_units', 'eng_attendance_records', 'eng_levels', 'eng_exam_results',
];

exports.up = async (knex) => {
  await knex.schema.alterTable('eng_courses', (t) => {
    t.decimal('attendance_threshold_ratio', 4, 3).notNullable().defaultTo(0.8);
  });
  await knex.schema.alterTable('eng_course_runs', (t) => {
    t.decimal('attendance_threshold_ratio_snapshot', 4, 3).notNullable().defaultTo(0.8);
  });
  await knex.raw(`ALTER TABLE eng_courses
    ADD CONSTRAINT ck_eng_courses_attendance_ratio
      CHECK (attendance_threshold_ratio > 0 AND attendance_threshold_ratio <= 1)`);
  await knex.raw(`ALTER TABLE eng_course_runs
    ADD CONSTRAINT ck_eng_runs_attendance_ratio
      CHECK (attendance_threshold_ratio_snapshot > 0 AND attendance_threshold_ratio_snapshot <= 1)`);

  // Domain audit is intentionally transaction-local. The global audit_log is
  // hash-chained asynchronously and cannot guarantee atomic command + audit.
  await knex.schema.createTable('eng_audit_events', (t) => {
    t.bigIncrements('id').primary();
    t.text('actor_user_id').references('id').inTable('users');
    t.text('actor_emp_code');
    t.text('action').notNullable();
    t.text('entity_type').notNullable();
    t.text('entity_key');
    t.jsonb('details').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX ix_eng_audit_entity
    ON eng_audit_events (entity_type, entity_key, created_at DESC)`);

  // These are now operational tables. Only raw workbook evidence and DQ rows
  // remain under the old archive freeze trigger.
  for (const table of LIVE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP TRIGGER IF EXISTS trg_${table}_archive_freeze ON ${table}`);
  }

  // Resolve only evidence-unambiguous import conflicts: exactly one active
  // enrollment has attendance and every competing active enrollment has none.
  // The no-evidence rows are retained as waiting/cancelled history.
  await knex.raw(`
    CREATE TEMP TABLE eng_active_enrollment_reconciliation ON COMMIT DROP AS
    WITH evidence AS (
      SELECT en.id, en.employee_id, en.cohort_membership_id,
        count(ar.id)::int AS attendance_count
      FROM eng_run_enrollments en
      LEFT JOIN eng_attendance_records ar ON ar.run_enrollment_id = en.id
      WHERE en.status = 'active'
      GROUP BY en.id
    ), resolvable AS (
      SELECT employee_id
      FROM evidence
      GROUP BY employee_id
      HAVING count(*) > 1
        AND count(*) FILTER (WHERE attendance_count > 0) = 1
        AND count(*) FILTER (WHERE attendance_count = 0) = count(*) - 1
    )
    SELECT e.id AS enrollment_id, e.employee_id, e.cohort_membership_id
    FROM evidence e JOIN resolvable r ON r.employee_id = e.employee_id
    WHERE e.attendance_count = 0
  `);

  await knex.raw(`
    INSERT INTO eng_audit_events(action, entity_type, entity_key, details)
    SELECT 'run_enrollment.reconcile', 'run_enrollment', x.enrollment_id,
      jsonb_build_object(
        'beforeStatus', en.status,
        'afterStatus', 'waiting',
        'reason', 'Competing active enrollment had no attendance; retained evidenced enrollment as active',
        'authority', 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9'
      )
    FROM eng_active_enrollment_reconciliation x
    JOIN eng_run_enrollments en ON en.id = x.enrollment_id
  `);
  await knex.raw(`
    UPDATE eng_run_enrollments en SET
      status = 'waiting',
      meta = coalesce(en.meta, '{}'::jsonb) || jsonb_build_object(
        'canonicalReconciliation', jsonb_build_object(
          'previousStatus', 'active',
          'reason', 'no_attendance_competing_active_enrollment',
          'migration', 47
        )
      ),
      updated_at = now()
    FROM eng_active_enrollment_reconciliation x
    WHERE en.id = x.enrollment_id
  `);
  await knex.raw(`
    UPDATE eng_cohort_memberships m SET status = 'cancelled'
    FROM eng_active_enrollment_reconciliation x
    WHERE m.id = x.cohort_membership_id
      AND m.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM eng_run_enrollments en
        WHERE en.cohort_membership_id = m.id AND en.status = 'active'
      )
  `);
  await knex.raw(`
    UPDATE eng_data_quality_issues q SET
      status = 'resolved',
      resolution_note = 'Resolved by canonical migration 047: attendance-evidenced enrollment retained; empty competitor set to waiting.',
      resolved_by = 'system:migration-047',
      resolved_at = now()
    WHERE q.issue_code = 'multi_active_enrollment'
      AND q.entity_key IN (
        SELECT e.emp_code
        FROM eng_active_enrollment_reconciliation x
        JOIN eng_employees e ON e.id = x.employee_id
      )
  `);

  // Refuse to hide an ambiguous conflict. It must be owner-reviewed before the
  // invariant can be installed.
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM eng_run_enrollments
        WHERE status = 'active'
        GROUP BY employee_id HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION 'Ambiguous multi-active English enrollment requires owner review';
      END IF;
    END $$
  `);

  await knex.raw(`CREATE UNIQUE INDEX uq_eng_enrollment_one_active_employee
    ON eng_run_enrollments (employee_id) WHERE status = 'active'`);
  await knex.raw(`CREATE UNIQUE INDEX uq_eng_cohort_current_pic
    ON eng_cohort_pic (cohort_id) WHERE end_date IS NULL`);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_eng_cohort_current_pic');
  await knex.raw('DROP INDEX IF EXISTS uq_eng_enrollment_one_active_employee');
  for (const table of LIVE_TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`CREATE TRIGGER trg_${table}_archive_freeze
      BEFORE INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION reject_frozen_english_archive_write()`);
  }
  await knex.schema.dropTableIfExists('eng_audit_events');
  await knex.raw('ALTER TABLE eng_course_runs DROP CONSTRAINT IF EXISTS ck_eng_runs_attendance_ratio');
  await knex.raw('ALTER TABLE eng_courses DROP CONSTRAINT IF EXISTS ck_eng_courses_attendance_ratio');
  await knex.schema.alterTable('eng_course_runs', (t) => t.dropColumn('attendance_threshold_ratio_snapshot'));
  await knex.schema.alterTable('eng_courses', (t) => t.dropColumn('attendance_threshold_ratio'));
};
