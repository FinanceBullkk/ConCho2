// Migration 016 — budgets + settings (Phase 3 Wave-B: finance / A1 budget & cost).
//
// budgets: a fiscal-year spend allowance, optionally scoped to a department
// and/or program (amount is integer MINOR units → bigint). cost_entries already
// exists (migration 008 — added early because the vendor spend roll-up read it).
// settings: a generic key→value(jsonb) store; finance's getTenantCurrency reads
// the LND_COST_CONFIG row for the tenant currency. Added here (the same "porting
// domain needs the table first" precedent as cost_entries) — the eventual
// settings-domain port reuses it. Both budgets is soft-deleted (golden rule);
// settings has no soft-delete (mirrors the Setting model).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('budgets', (t) => {
    t.text('id').primary();
    t.text('fiscal_year').notNullable();
    t.text('department_id');
    t.text('program_id');
    t.bigInteger('amount_minor').notNullable();   // integer minor currency units
    t.text('currency').notNullable();
    t.text('label').defaultTo('');
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_budgets_year_dept ON budgets(fiscal_year, department_id, is_deleted)`);

  await knex.schema.createTable('settings', (t) => {
    t.text('id').primary();
    t.text('key').notNullable();
    t.jsonb('value').notNullable();
    t.text('description').defaultTo('');
    stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_settings_key ON settings(key)`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('settings');
  await knex.schema.dropTableIfExists('budgets');
};
