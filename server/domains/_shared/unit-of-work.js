// ──────────────────────────────────────────────────────────
// Unit of Work — backend-agnostic transaction boundary
// ──────────────────────────────────────────────────────────
// The transaction-heavy domains (the schedule booking chokepoint, groups,
// planning, and the learning cohort-archive) wrap a multi-step mutation in ONE
// atomic unit. On MongoDB that is a `session.withTransaction`; on PostgreSQL a
// `BEGIN / COMMIT / ROLLBACK` on a checked-out pool client. This module hides
// that difference behind a single `runInTransaction(fn)`:
//
//   const out = await runInTransaction(async (tx) => {
//     await repo.insertX(payload, tx);    // repo impl reads tx.session | tx.client
//     return repo.findX(id, tx);
//   });
//
// `tx` is OPAQUE to the use-case — only the (dual-backend) repository impl knows
// whether it carries a Mongo `session` or a PG `client`. fn's return value is
// returned after the commit; ANY throw rolls the whole unit back and re-throws
// (so a duplicate-key error keeps propagating to the caller's 409 mapping).
//
// `impls` is exported (like the dual-backend repositories) so a parity test can
// drive BOTH backends in one run regardless of the DB_BACKEND default.
//
// Part of the Mongo→Postgres migration (plans/260612-2042-postgresql-migration/,
// Phase 3 Wave-D keystone). Inert for the running app while DB_BACKEND=mongo.
// ──────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const { getPool } = require('../../config/pg');
const { isPostgres } = require('../../config/db-backend');

// MongoDB: one session, one transaction. `withTransaction` auto-retries only on
// transient/commit-unknown errors — a duplicate-key (E11000) is NOT transient,
// so it aborts and re-throws, exactly like the legacy scheduleService relies on.
const runMongo = async (fn) => {
  const session = await mongoose.startSession();
  let out;
  try {
    await session.withTransaction(async () => {
      out = await fn({ session });
    });
  } finally {
    await session.endSession();
  }
  return out;
};

// PostgreSQL: check out a dedicated client so BEGIN/COMMIT scope a single
// connection (the pool's default auto-commit-per-query would not be atomic).
// Best-effort ROLLBACK on failure; the original error is the one we surface.
const runPg = async (fn) => {
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

const runInTransaction = (fn) => (isPostgres ? runPg : runMongo)(fn);

module.exports = { runInTransaction, impls: { mongo: runMongo, pg: runPg } };
