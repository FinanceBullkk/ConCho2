// Migration 004 — departments + org user fields (PG-migration Phase 3 Wave-B: org).
//
// The org domain: structured Department entity + the manager hierarchy / dashboard
// rollups. Adds the `departments` table and the User columns the org repository
// reads/writes (the manager hierarchy + dept assignment), which migration 001's
// minimal `users` table did not carry.
// Trap-equivalents: soft-delete columns/predicates; partial-unique department
// `code` among LIVE rows (reusable after soft-delete).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('departments', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('code').notNullable();
    t.text('description').defaultTo('');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_departments_code_active ON departments(code) WHERE is_deleted = false`);

  // org user fields (manager hierarchy + dept assignment + dashboard select).
  await knex.schema.alterTable('users', (t) => {
    t.text('department_id'); // structured Department ref (vs legacy `department` string)
    t.text('manager_id');    // org hierarchy
    t.text('position');
    t.text('status');
  });
  await knex.raw(`CREATE INDEX ix_users_department ON users(department_id)`);
  await knex.raw(`CREATE INDEX ix_users_manager ON users(manager_id)`);
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('department_id'); t.dropColumn('manager_id'); t.dropColumn('position'); t.dropColumn('status');
  });
  await knex.schema.dropTableIfExists('departments');
};
