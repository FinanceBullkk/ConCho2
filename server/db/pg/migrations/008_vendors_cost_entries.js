// Migration 008 — vendors + cost_entries (PG-migration Phase 3 Wave-B: A2/A1).
//
// vendors: external training-provider catalog (subdoc arrays contacts/contracts/
// ratings → jsonb; delivers = text[] program ids). cost_entries: A1 cost line
// items (the spend roll-up source; scope.* flattened to queryable columns). Money
// is integer MINOR units (bigint). Both soft-deleted (golden rule). cost_entries
// is added here because the vendor spend roll-up reads it; the finance domain
// port reuses the same table.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('vendors', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('type').defaultTo('provider');       // provider | individual | platform
    t.jsonb('contacts').defaultTo('[]');
    t.specificType('delivers', 'text[]');         // qualified program ids
    t.jsonb('contracts').defaultTo('[]');
    t.jsonb('ratings').defaultTo('[]');
    t.text('note').defaultTo('');
    t.text('status').notNullable().defaultTo('active'); // active | archived
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_vendors_status ON vendors(status, is_deleted)`);

  await knex.schema.createTable('cost_entries', (t) => {
    t.text('id').primary();
    t.text('scope_program_id');
    t.text('scope_cohort_id');
    t.text('scope_session_id');
    t.text('scope_department_id');
    t.text('scope_vendor_id');
    t.text('type').defaultTo('other');            // trainer|venue|material|vendor|travel|other
    t.bigInteger('amount_minor').notNullable();    // integer minor currency units
    t.text('currency').notNullable();
    t.timestamp('incurred_on', { useTz: true }).notNullable();
    t.text('po_ref').defaultTo('');
    t.text('note').defaultTo('');
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_cost_entries_vendor ON cost_entries(scope_vendor_id, is_deleted)`);
  await knex.raw(`CREATE INDEX ix_cost_entries_program ON cost_entries(scope_program_id, is_deleted)`);
  await knex.raw(`CREATE INDEX ix_cost_entries_incurred ON cost_entries(incurred_on, is_deleted)`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('cost_entries');
  await knex.schema.dropTableIfExists('vendors');
};
