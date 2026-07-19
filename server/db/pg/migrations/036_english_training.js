// 036 — English Training canonical schema (Phase 1: identity + structure).
//
// Greenfield English-training domain (plan: plans/english-integration-phase-1.md).
// Owns 7 canonical `eng_*` tables + a lossless import staging pair. Because this
// is NEW data (no dirty Mongo migration), constraints are INLINE (FK + CHECK +
// UNIQUE) so they run in CI *and* prod via `migrate:latest` — unlike the legacy
// core tables whose FKs were deferred to migrations-cutover/036_fk_check_hardening.js.
// NOTE: that cutover file shares the "036_" prefix but lives in a DIFFERENT dir
// (migrations-cutover/) and is NOT part of this chain; no runtime collision.
//
// Grain (one row = …) and invariants are pinned in the plan §3/§5. Key guards:
//   • eng_employees.emp_code unique (case-insensitive)   — stable business id
//   • eng_courses.course_code unique                     — generated slug
//   • eng_course_runs (cohort,course,run_number) unique  — repeat = new run
//   • eng_run_enrollments partial-unique (employee) WHERE status='active' — I4
//   • eng_cohort_memberships partial-unique (cohort,employee) WHERE active — I5
// Policy is COUNT-based: max_absences_allowed (real rule: absent >2 → ineligible),
// snapshotted per run — NOT ConMeoGauGau's ratio (English-only model, D-J/D-E).

const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  // ── courses (referenced by course_runs) ────────────────────────────────
  await knex.schema.createTable('eng_courses', (t) => {
    t.text('id').primary();
    t.text('course_code').notNullable();
    t.text('course_name').notNullable();
    t.integer('expected_units').notNullable();
    t.integer('max_absences_allowed').notNullable().defaultTo(2);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.jsonb('meta');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE eng_courses
    ADD CONSTRAINT uq_eng_courses_code UNIQUE (course_code),
    ADD CONSTRAINT ck_eng_courses_units CHECK (expected_units >= 0),
    ADD CONSTRAINT ck_eng_courses_absences CHECK (max_absences_allowed >= 0)`);

  // ── cohorts (stable learning group) ────────────────────────────────────
  await knex.schema.createTable('eng_cohorts', (t) => {
    t.text('id').primary();
    t.text('class_code').notNullable();
    t.text('display_name').notNullable();
    t.text('status').notNullable();
    t.integer('capacity');
    t.jsonb('meta');
    stamps(t, knex);
  });
  await knex.raw(`ALTER TABLE eng_cohorts
    ADD CONSTRAINT uq_eng_cohorts_class_code UNIQUE (class_code),
    ADD CONSTRAINT ck_eng_cohorts_status CHECK (status IN ('planned','active','completed','archived')),
    ADD CONSTRAINT ck_eng_cohorts_capacity CHECK (capacity IS NULL OR capacity > 0)`);

  // ── employees (keyed by emp_code; user_id crosswalk, no account yet) ────
  await knex.schema.createTable('eng_employees', (t) => {
    t.text('id').primary();
    t.text('emp_code').notNullable();
    t.text('full_name').notNullable();
    t.text('english_name');
    t.text('email');
    t.text('employment_status').notNullable();
    t.text('user_id').references('id').inTable('users').index();
    t.jsonb('meta');
    stamps(t, knex);
  });
  await knex.raw(`ALTER TABLE eng_employees
    ADD CONSTRAINT ck_eng_employees_emp_status CHECK (employment_status IN ('active','inactive','unknown'))`);
  await knex.raw(`CREATE UNIQUE INDEX uq_eng_employees_emp_code ON eng_employees (lower(emp_code))`);

  // ── cohort memberships (which stable group; derived from enrollments) ───
  await knex.schema.createTable('eng_cohort_memberships', (t) => {
    t.text('id').primary();
    t.text('cohort_id').notNullable().references('id').inTable('eng_cohorts').index();
    t.text('employee_id').notNullable().references('id').inTable('eng_employees').index();
    // Nullable on purpose: some source enrollments lack a start date; we record a
    // 'missing_membership_start' DQ issue rather than invent a date (PROJECT_RULES §3).
    t.date('start_date');
    t.date('end_date');
    t.text('status').notNullable();
    t.text('transfer_to_membership_id');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE eng_cohort_memberships
    ADD CONSTRAINT ck_eng_membership_status CHECK (status IN ('active','completed','transferred','cancelled'))`);
  // I5 helper: at most one ACTIVE membership per (cohort, employee).
  await knex.raw(`CREATE UNIQUE INDEX uq_eng_membership_active
    ON eng_cohort_memberships (cohort_id, employee_id) WHERE status = 'active'`);

  // ── course runs (one delivery of one course to one cohort) ──────────────
  await knex.schema.createTable('eng_course_runs', (t) => {
    t.text('id').primary();
    t.text('cohort_id').notNullable().references('id').inTable('eng_cohorts').index();
    t.text('course_id').notNullable().references('id').inTable('eng_courses').index();
    t.integer('run_number').notNullable();
    t.text('status').notNullable();
    t.integer('expected_units_snapshot').notNullable();
    t.integer('max_absences_allowed_snapshot').notNullable();
    t.date('start_date');
    t.date('end_date');
    stamps(t, knex);
  });
  await knex.raw(`ALTER TABLE eng_course_runs
    ADD CONSTRAINT uq_eng_course_runs UNIQUE (cohort_id, course_id, run_number),
    ADD CONSTRAINT ck_eng_run_number CHECK (run_number >= 1),
    ADD CONSTRAINT ck_eng_run_status CHECK (status IN ('planned','active','completed','cancelled','archived'))`);

  // ── run enrollments (one employee in one course run) ────────────────────
  await knex.schema.createTable('eng_run_enrollments', (t) => {
    t.text('id').primary();
    t.text('course_run_id').notNullable().references('id').inTable('eng_course_runs').index();
    t.text('employee_id').notNullable().references('id').inTable('eng_employees').index();
    t.text('cohort_membership_id').references('id').inTable('eng_cohort_memberships').index();
    t.text('status').notNullable();
    t.integer('start_session_number').notNullable().defaultTo(1);
    t.text('business_unit_id_snapshot');
    t.text('job_role_id_snapshot');
    t.text('transfer_from_enrollment_id');
    t.jsonb('meta');
    stamps(t, knex);
  });
  await knex.raw(`ALTER TABLE eng_run_enrollments
    ADD CONSTRAINT uq_eng_enr_run_employee UNIQUE (course_run_id, employee_id),
    ADD CONSTRAINT ck_eng_enr_status CHECK (status IN ('active','waiting','completed','transferred','dropped','cancelled')),
    ADD CONSTRAINT ck_eng_enr_start_session CHECK (start_session_number >= 1)`);
  // I4 ("one active enrollment per employee") is intentionally NOT a DB guard:
  // real data has legitimate concurrent enrollment (a learner in two different
  // courses at once). It stays a SOFT/reporting rule — the import records a
  // `multi_active_enrollment` DQ issue for owner review instead of blocking.
  await knex.raw(`CREATE INDEX ix_eng_enr_employee_active
    ON eng_run_enrollments (employee_id) WHERE status = 'active'`);

  // ── cohort PIC assignment (Person In Charge; employee OR free-text label) ─
  await knex.schema.createTable('eng_cohort_pic', (t) => {
    t.text('id').primary();
    t.text('cohort_id').notNullable().references('id').inTable('eng_cohorts').index();
    t.text('pic_employee_id').references('id').inTable('eng_employees').index();
    t.text('pic_label');
    t.date('start_date');
    t.date('end_date');
    t.jsonb('meta');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE eng_cohort_pic
    ADD CONSTRAINT ck_eng_pic_target CHECK (pic_employee_id IS NOT NULL OR pic_label IS NOT NULL)`);

  // ── lossless import: raw staging (append-only) + data-quality issues ────
  await knex.schema.createTable('raw_eng_workbook_rows', (t) => {
    t.text('id').primary();
    t.text('workbook_checksum').notNullable();
    t.text('sheet').notNullable();
    t.integer('source_row').notNullable();
    t.text('row_hash').notNullable();
    t.jsonb('payload').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE raw_eng_workbook_rows
    ADD CONSTRAINT uq_raw_eng_row UNIQUE (workbook_checksum, sheet, source_row)`);

  await knex.schema.createTable('eng_data_quality_issues', (t) => {
    t.text('id').primary();
    t.text('issue_code').notNullable();
    t.text('entity_type');
    t.text('entity_key');
    t.text('source_sheet');
    t.integer('source_row');
    t.jsonb('detail');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX ix_eng_dq_issue_code ON eng_data_quality_issues (issue_code)`);
};

exports.down = async (knex) => {
  // reverse dependency order.
  for (const tbl of [
    'eng_data_quality_issues', 'raw_eng_workbook_rows', 'eng_cohort_pic',
    'eng_run_enrollments', 'eng_course_runs', 'eng_cohort_memberships',
    'eng_employees', 'eng_cohorts', 'eng_courses',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.dropTableIfExists(tbl);
  }
};
