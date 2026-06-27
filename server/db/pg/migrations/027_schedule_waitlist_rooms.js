// Migration 027 — schedule chokepoint: waitlist_entries + room_bookings + schedule
// cancellation/capacity columns (Phase 3 Wave-D: domains/schedule).
//
// The booking spine (schedules) + the atomic booking-write seam landed earlier
// (001 + #214). This adds the two ledger tables the transaction-heavy paths need
// and the schedule columns the cancel + capacity flows read/write:
//   • waitlist_entries — per-session FIFO queue. STATUS-LIFECYCLE, NO soft-delete
//     (rows are history). Partial-unique {schedule_id,user_id} WHERE waiting =
//     the DB-final double-join guard (E11000→409); {schedule_id,status,created_at}
//     = the FIFO scan index.
//   • room_bookings — the per-room conflict lock. HARD-DELETE by design (a kept
//     row would brick the slot). Unique {room_id,start_time} = the room lock
//     (E11000→409 "room taken"); {schedule_id} = release/orphan-sweep reverse idx.
//   • schedules.{cancelled_at,cancelled_by,cancel_reason} — durable cancellation
//     stamp (cancel is history, never hard-delete); schedules.capacity — per-session
//     cap feeding effectiveSessionCapacity (∪ program capacityPolicy).
//
// Other Schedule extras (externalTrainer/vendorId/sessionTypeId/agenda/materials/
// customFields/googleEventId/remindersSentAt) ride in the existing schedules.meta
// jsonb — only the columns the domain filters/writes on get real columns.

const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.alterTable('schedules', (t) => {
    t.timestamp('cancelled_at', { useTz: true });
    t.text('cancelled_by');
    t.text('cancel_reason').defaultTo('');
    t.integer('capacity'); // null = no per-session cap (falls back to program policy)
  });

  await knex.schema.createTable('waitlist_entries', (t) => {
    t.text('id').primary();
    t.text('schedule_id').notNullable();
    t.text('class_id').notNullable();      // denormalised for class-scoped reads
    t.text('user_id').notNullable();
    t.text('status').notNullable().defaultTo('waiting'); // waiting|promoted|withdrawn|cancelled
    t.timestamp('promoted_at', { useTz: true });
    t.text('joined_by');
    stamps(t, knex);
  });
  // one LIVE queue row per (session, user) — the double-join guard.
  await knex.raw(`CREATE UNIQUE INDEX uq_waitlist_live ON waitlist_entries(schedule_id, user_id) WHERE status = 'waiting'`);
  // FIFO scan: oldest waiting first per session.
  await knex.raw(`CREATE INDEX ix_waitlist_fifo ON waitlist_entries(schedule_id, status, created_at)`);

  await knex.schema.createTable('room_bookings', (t) => {
    t.text('id').primary();
    t.text('room_id').notNullable();
    t.text('schedule_id').notNullable();
    t.text('class_id').notNullable();
    t.timestamp('start_time', { useTz: true }).notNullable();
    stamps(t, knex);
  });
  // THE room lock: at most one claim per room per slot.
  await knex.raw(`CREATE UNIQUE INDEX uq_room_bookings_slot ON room_bookings(room_id, start_time)`);
  // reverse lookup for release/orphan-sweep.
  await knex.raw(`CREATE INDEX ix_room_bookings_schedule ON room_bookings(schedule_id)`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('room_bookings');
  await knex.schema.dropTableIfExists('waitlist_entries');
  await knex.schema.alterTable('schedules', (t) => {
    t.dropColumn('cancelled_at'); t.dropColumn('cancelled_by');
    t.dropColumn('cancel_reason'); t.dropColumn('capacity');
  });
};
