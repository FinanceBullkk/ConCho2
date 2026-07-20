// 044 — Idempotency keys for the one-time active English handoff.
//
// The archive keeps completed history in eng_* while currently-active course
// runs are carried forward onto the generic Program → Cohort → PIC Team →
// Enrollment spine (Team key added by migration 046). Natural source keys live
// in the existing internal `meta` JSONB so the
// handoff can be retried without creating duplicates (including after a
// disposable archive re-import that assigns different row ids).

exports.up = async (knex) => {
  await knex.raw(`CREATE UNIQUE INDEX uq_program_english_archive_course_key
    ON learning_programs ((meta->>'englishArchiveCourseKey'))
    WHERE meta->>'englishArchiveCourseKey' IS NOT NULL`);
  await knex.raw(`CREATE UNIQUE INDEX uq_class_english_archive_run_key
    ON classes ((meta->>'englishArchiveRunKey'))
    WHERE meta->>'englishArchiveRunKey' IS NOT NULL`);
  await knex.raw(`CREATE UNIQUE INDEX uq_enrollment_english_archive_key
    ON enrollments ((meta->>'englishArchiveEnrollmentKey'))
    WHERE meta->>'englishArchiveEnrollmentKey' IS NOT NULL`);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_enrollment_english_archive_key');
  await knex.raw('DROP INDEX IF EXISTS uq_class_english_archive_run_key');
  await knex.raw('DROP INDEX IF EXISTS uq_program_english_archive_course_key');
};
