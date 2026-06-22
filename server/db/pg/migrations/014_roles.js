// Migration 014 — roles (Phase 3 Wave-B: access / RBAC roles).
//
// Custom + system roles with a capabilities text[]. Soft-deleted; key is unique
// among LIVE rows (Mongo partial unique {key} WHERE isDeleted=false).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('roles', (t) => {
    t.text('id').primary();
    t.text('key').notNullable();
    t.text('name').notNullable();
    t.boolean('system').notNullable().defaultTo(false);
    t.specificType('capabilities', 'text[]');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_roles_key_active ON roles(key) WHERE is_deleted = false`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('roles');
