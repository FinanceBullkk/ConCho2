// Migration 013 — tenant_config (Phase 3 Wave-B: branding singleton).
//
// A single branding/template config row (key='default'). No soft-delete — it is a
// find-or-create singleton (getSingleton upserts it with column defaults).

const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('tenant_config', (t) => {
    t.text('id').primary();
    t.text('key').notNullable();
    t.text('org_name').defaultTo('TMS');
    t.text('accent_color').defaultTo('#3b6fe0');
    t.text('logo_url').defaultTo('');
    t.text('certificate_title').defaultTo('Certificate of Completion');
    t.text('email_signature').defaultTo('');
    stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_tenant_config_key ON tenant_config(key)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('tenant_config');
