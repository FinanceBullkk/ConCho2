// 031 — users profile columns (Phase 3 Wave-F: legacy-tail dashboard/search).
//
// The admin dashboard's 14-query bundle (controllers/dashboard/) groups and
// filters on three User fields that still had no PG column (flagged as the
// blocker in the Wave-A notes: "many User cols live in meta jsonb → needs
// schema columns"). Extracted as real columns with the Mongoose defaults ('')
// so filters like `{ entranceLevel: { $ne: '' } }` translate to plain SQL.

exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.text('entrance_level').notNullable().defaultTo('');
    t.text('current_level').notNullable().defaultTo('');
    t.text('drop_reason').notNullable().defaultTo('');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumns('entrance_level', 'current_level', 'drop_reason');
  });
};
