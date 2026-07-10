// ──────────────────────────────────────────────────────────
// Atomic Sequence Helper — PostgreSQL
// ──────────────────────────────────────────────────────────
// Named, gapless-per-commit sequences (empCode, classCode, certificateNumber).
// `INSERT … ON CONFLICT DO UPDATE seq = seq + 1 RETURNING seq` — the row lock
// serializes concurrent increments (two concurrent calls never get the same
// number), and unlike a PG SEQUENCE the increment rolls back with a failed
// transaction, giving gapless-per-commit semantics (owner decision 2026-07-07,
// mig 033). The Mongo impl + the dual-backend seam were retired in Wave K
// Phase 2 Batch D1b (2026-07-10) after prod cut over to PostgreSQL.

/**
 * Get the next sequence number for a named counter (1, 2, 3…).
 *
 * @example
 *   const seq = await getNextSequence('empCode');
 *   const empCode = seq.toString().padStart(6, '0');  // '000001'
 */
// bigint comes back as a string from node-pg → Number (sequences stay far
// below Number.MAX_SAFE_INTEGER — ~1000 users, 3-digit class codes).
const getNextSequence = async (name) => {
  const { query } = require('../config/pg');
  const { rows } = await query(
    `INSERT INTO counters(id, seq) VALUES ($1, 1)
     ON CONFLICT (id) DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    [name]
  );
  return Number(rows[0].seq);
};

module.exports = { getNextSequence };
