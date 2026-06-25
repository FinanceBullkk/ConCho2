// ──────────────────────────────────────────────────────────
// booking-write-repository — POSTGRES impl
// ──────────────────────────────────────────────────────────
// Same interface as ./booking-write-repository.mongo. Writes go through the
// transaction's checked-out client (`tx.client`) so they join the caller's
// BEGIN/COMMIT unit; non-tx reads fall back to the pool.
//
// Fidelity pinned by the parity test:
//   • the double-booking guard = the partial-unique index
//     uq_sched_slot_scheduled ON schedules(class_id,start_time) WHERE status='scheduled'
//     (migration 001) — the SQL analogue of the Mongo partial-unique index;
//   • PG's unique-violation (23505) is re-thrown as a Mongo-style { code: 11000 }
//     so the booking use-case's `err.code === 11000` → 409 branch is unchanged
//     (the established dual-backend convention — see custom-field / office /
//     completion pg repos);
//   • a 'cancelled' row leaves the partial index, freeing the slot for re-booking.
// ──────────────────────────────────────────────────────────
const crypto = require('crypto');
const { query } = require('../../config/pg');

// ObjectId-shaped id for new rows (24 hex) — uniform with migrated Mongo ids.
const newId = () => crypto.randomBytes(12).toString('hex');

// PG 23505 → Mongo-style duplicate-key error so use-cases stay backend-agnostic.
const duplicateError = () => {
  const e = new Error('duplicate key value (slot already taken)');
  e.code = 11000;
  return e;
};

// Run on the tx client when present (joins the BEGIN/COMMIT unit); else the pool.
const exec = (tx, text, params) =>
  (tx && tx.client ? tx.client.query(text, params) : query(text, params));

const insertScheduledSession = async (
  { classId, bookedTeamId = null, startTime, endTime, enrolledUsers = [] },
  tx = {},
) => {
  try {
    const { rows } = await exec(
      tx,
      `INSERT INTO schedules(id,class_id,booked_team_id,start_time,end_time,status,enrolled_users)
       VALUES ($1,$2,$3,$4,$5,'scheduled',$6) RETURNING id,class_id,start_time,status`,
      [newId(), classId, bookedTeamId, startTime, endTime, enrolledUsers],
    );
    const r = rows[0];
    return { _id: r.id, classId: r.class_id, startTime: r.start_time, status: r.status };
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const countScheduledForClass = async (classId, tx = {}) => {
  const { rows } = await exec(
    tx,
    `SELECT count(*)::int AS n FROM schedules WHERE class_id = $1 AND status = 'scheduled'`,
    [classId],
  );
  return rows[0].n;
};

const cancelSession = async (id, tx = {}) => {
  const { rows } = await exec(
    tx,
    `UPDATE schedules SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND status = 'scheduled' RETURNING id,status`,
    [id],
  );
  return rows[0] ? { _id: rows[0].id, status: rows[0].status } : null;
};

module.exports = { insertScheduledSession, countScheduledForClass, cancelSession };
