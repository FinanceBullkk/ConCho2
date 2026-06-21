// Migration 003 — offices + rooms (PG-migration Phase 3 Wave-B: org/room CRUD).
//
// Physical-site org records: offices (sites) and office-scoped rooms. Both are
// soft-deleted like every org record so historical Schedule refs survive.
// Trap-equivalents (mirror the Mongoose models):
//   • soft-delete columns + explicit predicates (no pre('find') hook in SQL).
//   • partial-unique code among LIVE rows only — code reusable after soft-delete
//     (Mongo partialFilterExpression {isDeleted:false}).
//   • schedules.room_id — Room.countFutureSessionsForRoom + future booking refs
//     (Schedule.roomId, absent from migration 001's schedules table).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('offices', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('code').notNullable();
    t.text('address').defaultTo('');
    t.text('timezone').defaultTo('');
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_offices_code_active ON offices(code) WHERE is_deleted = false`);

  await knex.schema.createTable('rooms', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.text('code').notNullable();
    t.text('office_id').notNullable();
    t.integer('seats');
    t.boolean('is_active').notNullable().defaultTo(true);
    soft(t); stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_rooms_code_active ON rooms(code) WHERE is_deleted = false`);
  await knex.raw(`CREATE INDEX ix_rooms_office_active ON rooms(office_id, is_deleted)`);

  await knex.schema.alterTable('schedules', (t) => { t.text('room_id'); });
  await knex.raw(`CREATE INDEX ix_schedules_room ON schedules(room_id)`);
};

exports.down = async (knex) => {
  await knex.schema.alterTable('schedules', (t) => { t.dropColumn('room_id'); });
  await knex.schema.dropTableIfExists('rooms');
  await knex.schema.dropTableIfExists('offices');
};
