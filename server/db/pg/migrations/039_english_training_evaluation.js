// 039 — English Training Phase 3: exam result & level (evaluation).
// A learner who finishes a course run sits a final exam whose result IS a level
// (no numeric score, no fail state). Sitting is gated by attendance: >2 absences
// ⇒ cannot sit (the same COUNT-based rule pinned in migration 036). HR/Admin
// records the level from the app. Certificates stay out of scope (HR external).
//
// eng_levels is seeded reference data (13 ordered levels). eng_exam_results holds
// one ACTIVE result per run enrollment (soft-delete keeps history; a partial
// unique index enforces the "one active" rule while allowing deleted rows).

const LEVELS = [
  ['foundation', 'Foundation', 1],
  ['beginner', 'Beginner', 2],
  ['beginner_2', 'Beginner 2', 3],
  ['beginner_3', 'Beginner 3', 4],
  ['pre_intermediate', 'Pre-Intermediate', 5],
  ['pre_intermediate_1', 'Pre-Intermediate 1', 6],
  ['pre_intermediate_2', 'Pre-Intermediate 2', 7],
  ['pre_intermediate_3', 'Pre-Intermediate 3', 8],
  ['intermediate', 'Intermediate', 9],
  ['intermediate_1', 'Intermediate 1', 10],
  ['intermediate_2', 'Intermediate 2', 11],
  ['upper_intermediate', 'Upper-Intermediate', 12],
  ['advanced', 'Advanced', 13],
];

exports.up = async (knex) => {
  // ── levels (seeded reference data; ordered by rank) ─────────────────────
  await knex.schema.createTable('eng_levels', (t) => {
    t.text('code').primary();
    t.text('display_name').notNullable();
    t.integer('rank').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
  });
  await knex.raw(`ALTER TABLE eng_levels
    ADD CONSTRAINT uq_eng_levels_rank UNIQUE (rank),
    ADD CONSTRAINT ck_eng_levels_rank CHECK (rank >= 1)`);
  await knex('eng_levels').insert(
    LEVELS.map(([code, display_name, rank]) => ({ code, display_name, rank })),
  );

  // ── exam results (one active result per run enrollment) ─────────────────
  await knex.schema.createTable('eng_exam_results', (t) => {
    t.text('id').primary();
    t.text('run_enrollment_id').notNullable().references('id').inTable('eng_run_enrollments').index();
    t.text('level_code').notNullable().references('code').inTable('eng_levels').index();
    t.date('exam_date').notNullable();
    t.text('entered_by');
    t.text('note');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  // One ACTIVE (non-deleted) result per enrollment; soft-deleted rows are history.
  await knex.raw(`CREATE UNIQUE INDEX uq_eng_exam_result_active
    ON eng_exam_results (run_enrollment_id) WHERE is_deleted = false`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('eng_exam_results');
  await knex.schema.dropTableIfExists('eng_levels');
};
