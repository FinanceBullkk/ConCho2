// Migration 034 — schedules.reminders_sent_at (Phase 5 cutover-blocker slice 4, B7).
//
// The reminder cron's concurrency control is an atomic bulk CLAIM: stamp a
// unique claimStamp on every candidate, then re-fetch by exact stamp —
// concurrent cron firings claim disjoint sets. Mongo has the field + a
// (remindersSentAt, startTime) index; on PG this must be a REAL column (a
// meta-jsonb ride would make the exact-stamp re-fetch unindexable and the
// claim non-atomic).

exports.up = async (knex) => {
  await knex.schema.alterTable('schedules', (t) => {
    t.timestamp('reminders_sent_at', { useTz: true });
  });
  await knex.raw(
    'CREATE INDEX ix_schedules_reminders_sent_at ON schedules(reminders_sent_at, start_time)'
  );
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS ix_schedules_reminders_sent_at');
  await knex.schema.alterTable('schedules', (t) => {
    t.dropColumn('reminders_sent_at');
  });
};
