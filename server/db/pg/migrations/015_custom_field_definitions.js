// Migration 015 — custom_field_definitions (Phase 3 Wave-B: custom-field / Studio).
//
// Admin-defined custom fields per entity (Program/User/Cohort/Session). `options`
// + `show_in` are text[]; `required` is a flag; the field's display position is
// `display_order` (SQL reserves `order`, so the column is renamed — mapped back to
// `order` in the repository). Soft-deleted; (entity,key) is unique among LIVE rows
// only (Mongo partial unique {entity,key} WHERE isDeleted=false), so a deleted key
// can be re-created.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('custom_field_definitions', (t) => {
    t.text('id').primary();
    t.text('entity').notNullable().defaultTo('Program');
    t.text('key').notNullable();
    t.text('label').notNullable();
    t.text('type').notNullable().defaultTo('text');
    t.specificType('options', 'text[]');
    t.specificType('show_in', 'text[]');
    t.boolean('required').notNullable().defaultTo(false);
    t.integer('display_order').notNullable().defaultTo(0);
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_cfd_entity_key_active ON custom_field_definitions(entity, key) WHERE is_deleted = false`);
  await knex.raw(`CREATE INDEX ix_cfd_entity_order ON custom_field_definitions(entity, display_order)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('custom_field_definitions');
