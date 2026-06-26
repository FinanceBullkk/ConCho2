// Migration 025 — attendance fields + indexes (Phase 3 Wave-B: domains/attendance).
//
// The attendances table spine landed in 001 (id/user_id/schedule_id/status +
// stamps, NO soft-delete — T16: attendance is never soft-deleted). This adds the
// scalar fields the Attendance model carries beyond status, plus the compound
// indexes the domain's reads/aggregations + the HR-export claim path rely on,
// and the User.lastActiveAt denormalisation column (PERF-008 write-through):
//   • remark / photo_url — per-record marking notes (bulkMark $set).
//   • sync_status / export_batch_id / exported_at — HR-export tracking (the
//     export domain is Wave F; the columns + sparse export_batch_id index land
//     now so attendance reads return the full model shape).
//   • compound indexes mirror the Mongo model: {scheduleId,userId} UNIQUE
//     (one record per user per session — also the ON CONFLICT target for the
//     bulk upsert), {userId,createdAt} (history), {userId,status} (rollups),
//     {createdAt,userId} (dashboard date scan), {syncStatus,createdAt} (export),
//     sparse {exportBatchId} (PERF-010 batch-claim second pass).
//   • users.last_active_at — denormalised by bumpUsersLastActive ($max →
//     GREATEST, never moves backward); read by the getUsers list enrichment.
//
// FK constraints stay deferred (project-wide). Single-column user_id/schedule_id
// indexes from 001 are left in place (harmless alongside the compounds).

exports.up = async (knex) => {
  await knex.schema.alterTable('attendances', (t) => {
    t.text('remark').defaultTo('');
    t.text('photo_url').defaultTo('');
    t.text('sync_status').notNullable().defaultTo('PENDING'); // PENDING|EXPORTING|EXPORTED
    t.text('export_batch_id');                                // set while claimed by an export job
    t.timestamp('exported_at', { useTz: true });
  });

  // one record per user per session (Mongo {scheduleId,userId} unique) — also the
  // bulk-upsert ON CONFLICT target.
  await knex.raw(`CREATE UNIQUE INDEX uq_attendances_schedule_user ON attendances(schedule_id, user_id)`);
  await knex.raw(`CREATE INDEX ix_attendances_user_created ON attendances(user_id, created_at DESC)`);
  await knex.raw(`CREATE INDEX ix_attendances_user_status ON attendances(user_id, status)`);
  await knex.raw(`CREATE INDEX ix_attendances_created_user ON attendances(created_at, user_id)`);
  await knex.raw(`CREATE INDEX ix_attendances_sync_created ON attendances(sync_status, created_at)`);
  // PERF-010: the export mark-as-exported pass queries {exportBatchId} — sparse.
  await knex.raw(`CREATE INDEX ix_attendances_export_batch ON attendances(export_batch_id) WHERE export_batch_id IS NOT NULL`);

  await knex.schema.alterTable('users', (t) => {
    t.timestamp('last_active_at', { useTz: true }); // PERF-008 denormalised activity stamp
  });
};

exports.down = async (knex) => {
  await knex.raw(`DROP INDEX IF EXISTS ix_attendances_export_batch`);
  await knex.raw(`DROP INDEX IF EXISTS ix_attendances_sync_created`);
  await knex.raw(`DROP INDEX IF EXISTS ix_attendances_created_user`);
  await knex.raw(`DROP INDEX IF EXISTS ix_attendances_user_status`);
  await knex.raw(`DROP INDEX IF EXISTS ix_attendances_user_created`);
  await knex.raw(`DROP INDEX IF EXISTS uq_attendances_schedule_user`);
  await knex.schema.alterTable('attendances', (t) => {
    t.dropColumn('remark');
    t.dropColumn('photo_url');
    t.dropColumn('sync_status');
    t.dropColumn('export_batch_id');
    t.dropColumn('exported_at');
  });
  await knex.schema.alterTable('users', (t) => { t.dropColumn('last_active_at'); });
};
