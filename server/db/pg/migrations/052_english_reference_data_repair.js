// 052 — Restore English reference data that a seed run could destroy.
//
// `eng_levels` (13 ordered levels, migration 039) and the
// `english_archive_control` singleton (migration 043) are SCHEMA-owned rows, but
// `scripts/seed-pg.js` used to TRUNCATE every table and restore neither. Any
// environment seeded with that version silently lost them: the level list came
// back empty, so exam-result entry was impossible, and the archive freeze could
// never engage (the UPDATE matched no row).
//
// The seed script and the test reset now leave both alone; this migration heals
// the environments that were already emptied. It is additive and idempotent —
// `ON CONFLICT DO NOTHING` keeps existing rows untouched.

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
  await knex('eng_levels')
    .insert(LEVELS.map(([code, display_name, rank]) => ({ code, display_name, rank })))
    .onConflict('code')
    .ignore();

  await knex('english_archive_control')
    .insert({ singleton: true, is_frozen: false })
    .onConflict('singleton')
    .ignore();
};

// Reference data other rows point at (eng_exam_results.level_code) — removing it
// on rollback would break history, and migrations 039/043 own its creation.
exports.down = async () => {};
