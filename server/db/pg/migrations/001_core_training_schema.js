// Migration 001 — core training schema (PG-migration Phase 2 foundation).
//
// The booking/training spine: programs → cohorts(classes) → teams → enrollments
// → schedules → attendances, plus certificates. Encodes the load-bearing Mongo
// trap-equivalents as plain SQL:
//   • text PK = Mongo ObjectId hex (per plan strategy; new rows can default uuid)
//   • soft-delete columns (is_deleted/deleted_at) — replaces the pre('aggregate')
//     hooks; queries filter explicitly (DATA-009 discipline)
//   • partial unique indexes (soft-delete-aware) — replaces partialFilterExpression,
//     incl. the Schedule double-booking guard {class_id,start_time} WHERE scheduled
//   • jsonb `meta` for flexible subdocs (policy blobs, external trainer, etc.)
//
// FK CONSTRAINTS are intentionally deferred to a post-ETL hardening migration —
// Mongo never enforced referential integrity, so migrated data may carry dangling
// refs; we add FK-column INDEXES now (join perf) and the constraints after cleanup.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('learning_programs', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.integer('default_session_count');
    t.text('scheduling_mode');
    t.text('status');
    t.jsonb('meta');
    soft(t); stamps(t, knex);
  });

  await knex.schema.createTable('users', (t) => {
    t.text('id').primary();
    t.text('emp_code');
    t.text('email');
    t.text('name');
    t.text('department');
    t.text('role');
    t.jsonb('meta');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_users_emp_code_active ON users(emp_code) WHERE is_deleted = false`);
  await knex.raw(`CREATE UNIQUE INDEX uq_users_email_active ON users(email) WHERE is_deleted = false AND email IS NOT NULL`);

  await knex.schema.createTable('classes', (t) => {
    t.text('id').primary();
    t.text('class_code').notNullable();
    t.text('course_name');
    t.text('program_id').index();
    t.integer('total_sessions');
    t.text('status');
    t.jsonb('meta');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_classes_code_course_active ON classes(class_code, course_name) WHERE is_deleted = false`);

  await knex.schema.createTable('teams', (t) => {
    t.text('id').primary();
    t.text('name');
    t.text('class_id').index();
    t.text('leader_id');
    t.jsonb('meta');
    soft(t); stamps(t, knex);
  });

  await knex.schema.createTable('team_members', (t) => {
    t.text('team_id').notNullable();
    t.text('user_id').notNullable();
    t.primary(['team_id', 'user_id']);
  });
  await knex.raw(`CREATE INDEX ix_team_members_user ON team_members(user_id)`);

  await knex.schema.createTable('enrollments', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable().index();
    t.text('class_id').index();
    t.text('team_id').index();              // null = direct cohort enrollment
    t.text('status').notNullable();          // Active|Completed|Dropped|On-hold|Transferred
    t.timestamp('joined_at', { useTz: true });
    t.timestamp('left_at', { useTz: true });
    t.text('note');
    t.jsonb('meta');
    stamps(t, knex);
  });
  // one Active team-enrollment per (user, team) — soft-delete-aware analogue
  await knex.raw(`CREATE UNIQUE INDEX uq_enr_active_team ON enrollments(user_id, team_id) WHERE status = 'Active' AND team_id IS NOT NULL`);

  await knex.schema.createTable('schedules', (t) => {
    t.text('id').primary();
    t.text('class_id').notNullable().index();
    t.text('booked_team_id').index();
    t.timestamp('start_time', { useTz: true }).notNullable();
    t.timestamp('end_time', { useTz: true });
    t.text('status').notNullable();          // scheduled|cancelled
    t.specificType('enrolled_users', 'text[]');
    t.specificType('session_instructor_ids', 'text[]');
    t.jsonb('meta');
    stamps(t, knex);
  });
  // double-booking guard: the Mongo partial unique {class_id,start_time} status:scheduled
  await knex.raw(`CREATE UNIQUE INDEX uq_sched_slot_scheduled ON schedules(class_id, start_time) WHERE status = 'scheduled'`);

  await knex.schema.createTable('attendances', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable().index();
    t.text('schedule_id').notNullable().index();
    t.text('status').notNullable();          // P|A|L|EL
    t.jsonb('meta');
    stamps(t, knex);
  });

  await knex.schema.createTable('certificates', (t) => {
    t.text('id').primary();
    t.text('user_id').index();
    t.text('program_id').index();
    t.text('status');                        // Issued|Revoked
    t.timestamp('issued_at', { useTz: true });
    t.jsonb('meta');
    soft(t); stamps(t, knex);
  });
};

exports.down = async (knex) => {
  // reverse order (no FK constraints yet, but keep it tidy)
  for (const tbl of ['certificates', 'attendances', 'schedules', 'enrollments',
    'team_members', 'teams', 'classes', 'users', 'learning_programs']) {
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.dropTableIfExists(tbl);
  }
};
