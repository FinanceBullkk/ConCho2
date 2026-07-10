// ──────────────────────────────────────────────────────────
// Unit of Work — transaction boundary (PostgreSQL)
// ──────────────────────────────────────────────────────────
// The transaction-heavy domains (the schedule booking chokepoint, groups,
// planning, and the learning cohort-archive) wrap a multi-step mutation in ONE
// atomic unit — a `BEGIN / COMMIT / ROLLBACK` on a checked-out pool client.
// This module hides that behind a single `runInTransaction(fn)`:
//
//   const out = await runInTransaction(async (tx) => {
//     await repo.insertX(payload, tx);    // repo impl reads tx.client
//     return repo.findX(id, tx);
//   });
//
// `tx` is OPAQUE to the use-case — only the repository impl knows it carries a
// PG `client`. fn's return value is returned after the commit; ANY throw rolls
// the whole unit back and re-throws (so a duplicate-key error keeps propagating
// to the caller's 409 mapping).
//
// The Mongo `session.withTransaction` runner + the dual-backend seam were
// retired in Wave K Phase 2 Batch D1b (2026-07-10) after prod cut over to PG.
// ──────────────────────────────────────────────────────────
const { getPool } = require('../../config/pg');

// Check out a dedicated client so BEGIN/COMMIT scope a single connection (the
// pool's default auto-commit-per-query would not be atomic). Best-effort
// ROLLBACK on failure; the original error is the one we surface.
const runInTransaction = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn({ client });
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { runInTransaction };
