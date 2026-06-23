// Migration 021 — assessment_questions (Phase 3 Wave-B: assessment question bank).
//
// Reusable question-bank items. type ∈ single_choice|multiple_choice|short_text.
// options/correct_option_indexes/accepted_answers default to UNDEFINED in Mongo
// (absent, not []) so they are NULLABLE here and the repo OMITS them when null.
// tags defaults to []. Soft-deleted (explicit isDeleted filter — no Mongoose
// hooks). A GIN index on tags backs the tag filter.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('assessment_questions', (t) => {
    t.text('id').primary();
    t.text('type').notNullable();
    t.text('prompt').notNullable();
    t.specificType('options', 'text[]');                  // nullable (default undefined)
    t.specificType('correct_option_indexes', 'integer[]'); // nullable
    t.specificType('accepted_answers', 'text[]');          // nullable
    t.specificType('points', 'double precision').notNullable().defaultTo(1);
    t.text('explanation').defaultTo('');
    t.specificType('tags', 'text[]');                      // default [] applied in app
    t.text('program_id').index();
    t.text('cohort_id').index();
    t.text('created_by').index();
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_assessment_questions_type ON assessment_questions(type, is_deleted)`);
  await knex.raw(`CREATE INDEX ix_assessment_questions_tags ON assessment_questions USING GIN (tags)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('assessment_questions');
