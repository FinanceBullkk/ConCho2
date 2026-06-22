// Migration 018 — required_training + users.office_id (Phase 3 Wave-B: compliance / A3).
//
// required_training: a compliance rule — an audience (appliesTo: role/department/
// office/all) must complete a target (program | path) within dueWithinDays, on a
// recurrence. appliesTo.* and target.* are flattened to queryable columns (the
// Mongo index is {appliesTo.type, appliesTo.value, isDeleted}). Soft-deleted.
//
// users.office_id is added here: the compliance workforce read selects officeId
// (office-scoped requirements match on it) and no earlier port needed the column.
// Additive — same "porting domain needs the column first" precedent as settings.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('required_training', (t) => {
    t.text('id').primary();
    t.text('applies_to_type').notNullable();    // role | department | office | all
    t.text('applies_to_value').defaultTo('');
    t.text('target_kind').defaultTo('program'); // program | path
    t.text('target_id').notNullable();
    t.integer('due_within_days').defaultTo(90);
    t.text('recurrence').defaultTo('once');     // once | annual | biennial
    t.boolean('mandatory').notNullable().defaultTo(true);
    t.text('label').defaultTo('');
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_required_training_audience ON required_training(applies_to_type, applies_to_value, is_deleted)`);

  await knex.schema.alterTable('users', (t) => { t.text('office_id'); });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => { t.dropColumn('office_id'); });
  await knex.schema.dropTableIfExists('required_training');
};
