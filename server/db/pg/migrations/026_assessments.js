// Migration 026 — assessments (Phase 3 Wave-B: domains/assessment).
//
// The generic assessment engine: a configurable quiz attached to a cohort, with
// an item-based definition (single_choice|multiple_choice|short_text). Attempts
// (assessment_attempts) + question-bank items (assessment_questions) already
// landed in 011 / 021 — this adds the assessment definition itself.
//
//   • items → jsonb (the authored item array; each item carries a generated _id,
//     prompt, options/correctOptionIndexes/acceptedAnswers, questionBankItemId,
//     points — exactly the Mongo subdoc shape, _ids generated app-side on create).
//   • passing_score_percent = double precision (Number; node-pg → JS number).
//     max_attempts / time_limit_minutes = integer counts.
//   • soft-delete (trash) + stamps per convention; FK constraints deferred.
//   • GIN index on items supports the grading-queue filter (assessments that
//     contain a short_text item → `items @> '[{"type":"short_text"}]'`).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('assessments', (t) => {
    t.text('id').primary();
    t.text('title').notNullable();
    t.text('description').defaultTo('');
    t.text('cohort_id').notNullable().index();
    t.text('program_id');
    t.jsonb('items').notNullable().defaultTo('[]');
    t.specificType('passing_score_percent', 'double precision').notNullable().defaultTo(0);
    t.integer('max_attempts').notNullable().defaultTo(0);
    t.integer('time_limit_minutes').notNullable().defaultTo(0);
    t.boolean('shuffle_questions').notNullable().defaultTo(false);
    t.boolean('show_answers_after').notNullable().defaultTo(false);
    t.boolean('is_published').notNullable().defaultTo(false);
    t.text('created_by').index();
    soft(t); stamps(t, knex);
  });
  // Mongo {cohortId:1, isDeleted:1} compound (cohort-scoped live reads).
  await knex.raw(`CREATE INDEX ix_assessments_cohort_deleted ON assessments(cohort_id, is_deleted)`);
  // grading-queue filter: assessments containing a short_text item.
  await knex.raw(`CREATE INDEX ix_assessments_items ON assessments USING GIN (items jsonb_path_ops)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('assessments');
