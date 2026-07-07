// ──────────────────────────────────────────────────────────
// Atomic Sequence Helper — dual-backend (Mongo ⇔ Postgres)
// ──────────────────────────────────────────────────────────
// Named, gapless-per-commit sequences (empCode, classCode, certificateNumber).
// Callers keep `require('../helpers/counter')` unchanged; DB_BACKEND selects
// the impl (unit-of-work style: both impls inline — the seam is two queries).
//
// Mongo: `findOneAndUpdate $inc upsert` — one atomic engine-level op; two
// concurrent calls never receive the same number.
// Postgres: `INSERT … ON CONFLICT DO UPDATE seq = seq + 1 RETURNING seq` —
// the row lock serializes concurrent increments (same guarantee), and unlike
// a PG SEQUENCE the increment rolls back with a failed transaction, matching
// Mongo's gapless-per-commit semantics (owner decision 2026-07-07, mig 033).
//
// Part of the PG migration Phase-5 "zero raw-Mongoose write" gate
// (plans/260612-2042-postgresql-migration/phase-05-cutover-decommission.md).
const { isPostgres } = require('../config/db-backend');

/**
 * Get the next sequence number for a named counter (1, 2, 3…).
 *
 * @example
 *   const seq = await getNextSequence('empCode');
 *   const empCode = seq.toString().padStart(6, '0');  // '000001'
 */
const mongoGetNextSequence = async (name) => {
  const Counter = require('../models/Counter');
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }   // create if missing, return updated doc
  );
  return counter.seq;
};

// bigint comes back as a string from node-pg → Number (sequences stay far
// below Number.MAX_SAFE_INTEGER — ~1000 users, 3-digit class codes).
const pgGetNextSequence = async (name) => {
  const { query } = require('../config/pg');
  const { rows } = await query(
    `INSERT INTO counters(id, seq) VALUES ($1, 1)
     ON CONFLICT (id) DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    [name]
  );
  return Number(rows[0].seq);
};

const getNextSequence = (name) => (isPostgres ? pgGetNextSequence : mongoGetNextSequence)(name);

module.exports = {
  getNextSequence,
  impls: {
    mongo: { getNextSequence: mongoGetNextSequence },
    pg: { getNextSequence: pgGetNextSequence },
  },
};
