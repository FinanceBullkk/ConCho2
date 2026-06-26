// Migration 024 — enrollments.transferred_to (PG-migration Phase 3 Wave-D, groups slice 3).
//
// The team enrollment-sync TRANSFER path sets Enrollment.transferredTo (the team a
// learner moved to) alongside status='Transferred' + leftAt. The enrollments table
// (migration 001) was created without the column; add it so the dual-backend
// transfer write is faithful to Mongo. FK-column INDEX only — the constraint is
// deferred to the post-ETL hardening migration, consistent with migration 001.
exports.up = async (knex) => {
  await knex.schema.alterTable('enrollments', (t) => {
    t.text('transferred_to').index();
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('enrollments', (t) => {
    t.dropColumn('transferred_to');
  });
};
