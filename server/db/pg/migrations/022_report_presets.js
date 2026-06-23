// Migration 022 — report_presets (Phase 3 Wave-B: saved report presets, A5 part 2).
//
// A named, saved report configuration. `filters` (from/to/departmentId/role/
// programIds) is a subdocument → jsonb; the repo applies the Mongoose subdoc
// defaults on create/replace so a partial payload lands identically. Soft-deleted
// (isDeleted/deletedAt are select:false → omitted from reads). The {schedule,
// is_deleted} index backs a future auto-run cron.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('report_presets', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('kind').defaultTo('evidence');      // hours | compliance | evidence
    t.jsonb('filters');
    t.text('schedule').defaultTo('none');       // none | monthly | quarterly
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_report_presets_schedule ON report_presets(schedule, is_deleted)`);
};

exports.down = async (knex) => knex.schema.dropTableIfExists('report_presets');
