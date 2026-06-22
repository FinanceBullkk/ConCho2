// Migration 017 — automation_rules (Phase 3 Wave-B: automation / no-code rules).
//
// "when → if → then" rules run by the event-bus runner. conditions + actions are
// jsonb arrays (payload predicates / runner actions). Opt-in (`enabled` default
// false). Soft-deleted; one LIVE system rule per name (Mongo partial unique
// {name} WHERE system=true AND isDeleted=false — idempotent seeding).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('automation_rules', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('trigger').notNullable();
    t.jsonb('conditions').defaultTo('[]');
    t.jsonb('actions').defaultTo('[]');
    t.boolean('enabled').notNullable().defaultTo(false);
    t.integer('run_count').notNullable().defaultTo(0);
    t.timestamp('last_run_at', { useTz: true });
    t.boolean('system').notNullable().defaultTo(false);
    soft(t); stamps(t, knex);
  });
  // The runner's hot path: enabled rules for a fired trigger.
  await knex.raw(`CREATE INDEX ix_automation_rules_trigger ON automation_rules(is_deleted, enabled, trigger)`);
  // One live system rule per name (idempotent seeding).
  await knex.raw(`CREATE UNIQUE INDEX uq_automation_rules_system_name ON automation_rules(name) WHERE system = true AND is_deleted = false`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('automation_rules');
