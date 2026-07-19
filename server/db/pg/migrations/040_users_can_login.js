// 040 — Authentication eligibility for managed training-only people.
//
// Training participation and application access are independent concerns.
// Normal users keep the historical behavior through the DEFAULT true; English
// learners provisioned only for rosters can be Active while can_login=false.

exports.up = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('can_login').notNullable().defaultTo(true).index();
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('can_login');
  });
};
