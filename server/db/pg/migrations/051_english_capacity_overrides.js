// 051 — Reasoned admissions above canonical English class capacity.
//
// One immutable support row records one authorized learner transfer that made
// the stable class's active membership count exceed its configured capacity.
// The class capacity itself is not changed. Domain audit rows are written by
// the same application transaction that creates this record and the transfer.

const TABLE = 'eng_cohort_capacity_overrides';

exports.up = async (knex) => {
  await knex.schema.createTable(TABLE, (t) => {
    t.text('id').primary();
    t.text('cohort_id').notNullable().references('id').inTable('eng_cohorts').index();
    t.text('employee_id').notNullable().references('id').inTable('eng_employees').index();
    t.text('course_run_id').notNullable().references('id').inTable('eng_course_runs').index();
    t.integer('previous_capacity').notNullable();
    t.integer('resulting_active_learner_count').notNullable();
    t.text('reason').notNullable();
    t.text('actor_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE ${TABLE}
    ADD CONSTRAINT ck_eng_capacity_override_previous_positive
      CHECK (previous_capacity > 0),
    ADD CONSTRAINT ck_eng_capacity_override_result_above_limit
      CHECK (resulting_active_learner_count > previous_capacity),
    ADD CONSTRAINT ck_eng_capacity_override_reason_nonblank
      CHECK (NULLIF(BTRIM(reason), '') IS NOT NULL)`);
};

exports.down = async (knex) => {
  const [{ count }] = await knex(TABLE).count('* AS count');
  if (Number(count) > 0) {
    throw new Error(
      'Refusing to drop non-empty English capacity override history; restore from a pre-migration backup instead',
    );
  }
  await knex.schema.dropTableIfExists(TABLE);
};
