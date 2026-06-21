// Migration 006 — skills (PG-migration Phase 3 Wave-B: skill/competency framework).
//
// A named workforce capability built by one or more LearningPrograms. Proficiency
// is DERIVED (not stored) from issued certificates → the skill repository only
// persists the skill definition; the completion-signal reads run over the
// existing certificates/users/learning_programs tables.
// Trap-equivalents: soft-delete predicates; partial-unique `name` among LIVE rows.
// program_ids = text[] (the program→skill mapping); target_by_role = jsonb.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('skills', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('category').defaultTo('General');
    t.text('parent_id');                          // taxonomy parent (null = top-level)
    t.integer('hue').defaultTo(250);
    t.specificType('program_ids', 'text[]');      // programs that build this skill
    t.integer('max_level').defaultTo(5);
    t.jsonb('target_by_role').defaultTo('{}');    // { roleKey: level }
    t.integer('coverage_target');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_skills_name_active ON skills(name) WHERE is_deleted = false`);
  await knex.raw(`CREATE INDEX ix_skills_live_cat_name ON skills(is_deleted, category, name)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('skills');
