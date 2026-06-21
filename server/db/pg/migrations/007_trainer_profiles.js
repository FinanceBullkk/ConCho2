// Migration 007 — trainer_profiles (PG-migration Phase 3 Wave-B: A6 trainer depth).
//
// 1:1 capability/availability record for a Teacher/Admin User who delivers
// training. Drives the scheduling picker + per-trainer load view + ratings.
// Conflict ledger lives on schedules.session_instructor_ids (not here).
// Subdoc arrays (availability, ratings) land as jsonb; canDeliver = text[].
// Also adds the schedules columns the trainer reads select (office_id, topic).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('trainer_profiles', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable();              // 1:1 with a Teacher/Admin user
    t.specificType('can_deliver', 'text[]');       // qualified program ids
    t.jsonb('availability').defaultTo('[]');        // [{weekday,from,to}]
    t.jsonb('ratings').defaultTo('[]');             // [{value,note,by,at,_id}]
    t.text('note').defaultTo('');
    t.text('status').notNullable().defaultTo('active'); // active | archived
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_trainer_profiles_user ON trainer_profiles(user_id)`);
  await knex.raw(`CREATE INDEX ix_trainer_profiles_status ON trainer_profiles(status, is_deleted)`);

  // schedules columns the trainer load/availability reads select.
  await knex.schema.alterTable('schedules', (t) => { t.text('office_id'); t.text('topic'); });
  await knex.raw(`CREATE INDEX ix_schedules_office_start ON schedules(office_id, start_time)`);
};

exports.down = async (knex) => {
  await knex.schema.alterTable('schedules', (t) => { t.dropColumn('office_id'); t.dropColumn('topic'); });
  await knex.schema.dropTableIfExists('trainer_profiles');
};
