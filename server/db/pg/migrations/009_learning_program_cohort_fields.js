// Migration 009 — learning program + cohort catalog fields (Phase 3 Wave-B: learning).
//
// Fleshes out learning_programs (the LearningProgram catalog) and classes (the
// Cohort) with the full field set the learning repository reads/writes. Policy
// sub-objects + customFields land as jsonb (the project's jsonb-staging strategy);
// prerequisitePrograms / teacherIds = text[]. Encodes the load-bearing unique
// indexes: program code, program name (case-insensitive — Mongo collation
// strength:2), and the Ongoing-cohort guard.

exports.up = async (knex) => {
  await knex.schema.alterTable('learning_programs', (t) => {
    t.text('code');
    t.text('description').defaultTo('');
    t.text('category').defaultTo('other');
    t.text('delivery_mode').defaultTo('online');
    t.integer('certificate_validity_days');
    t.text('legacy_course_name').defaultTo('');
    t.jsonb('completion_policy');
    t.jsonb('capacity_policy');
    t.jsonb('facilitator_policy');
    t.jsonb('recertify_policy');
    t.jsonb('custom_fields').defaultTo('{}');
    t.specificType('prerequisite_programs', 'text[]');
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_learning_programs_code ON learning_programs(code) WHERE code IS NOT NULL`);
  // Mongo: unique {name} with collation strength:2 (case-insensitive) → lower(name).
  await knex.raw(`CREATE UNIQUE INDEX uq_learning_programs_name_ci ON learning_programs(lower(name))`);
  await knex.raw(`CREATE INDEX ix_learning_programs_legacy ON learning_programs(lower(legacy_course_name))`);

  await knex.schema.alterTable('classes', (t) => {
    t.jsonb('custom_fields').defaultTo('{}');
    t.specificType('teacher_ids', 'text[]');
  });
  // Mongo partial-unique {classCode,status} WHERE status='Ongoing' — one live run per code.
  await knex.raw(`CREATE UNIQUE INDEX uq_classes_code_ongoing ON classes(class_code) WHERE status = 'Ongoing'`);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_classes_code_ongoing');
  await knex.schema.alterTable('classes', (t) => { t.dropColumn('custom_fields'); t.dropColumn('teacher_ids'); });
  await knex.raw('DROP INDEX IF EXISTS ix_learning_programs_legacy');
  await knex.raw('DROP INDEX IF EXISTS uq_learning_programs_name_ci');
  await knex.raw('DROP INDEX IF EXISTS uq_learning_programs_code');
  await knex.schema.alterTable('learning_programs', (t) => {
    t.dropColumn('code'); t.dropColumn('description'); t.dropColumn('category'); t.dropColumn('delivery_mode');
    t.dropColumn('certificate_validity_days'); t.dropColumn('legacy_course_name');
    t.dropColumn('completion_policy'); t.dropColumn('capacity_policy'); t.dropColumn('facilitator_policy');
    t.dropColumn('recertify_policy'); t.dropColumn('custom_fields'); t.dropColumn('prerequisite_programs');
  });
};
