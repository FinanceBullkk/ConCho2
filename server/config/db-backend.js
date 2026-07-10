// DB backend selector.
// PostgreSQL is the only runtime backend since Wave K Phase 2 Batch D1
// (2026-07-10) — prod cut over to PG and Atlas was cancelled, so the default is
// now 'postgres' (was 'mongo' through the migration). Kept as a stable shim so
// the former dual-backend callers (repository selectors, unit-of-work, counter,
// retention-purge, health) need no edits; `isMongo` is now effectively dead.
// The `impls.mongo` side of the repository selectors + the pg-parity comparison
// tests are retired separately (Batch D1b, gated on the pg-parity decision).
const DB_BACKEND = (process.env.DB_BACKEND || 'postgres').toLowerCase();
const isPostgres = DB_BACKEND !== 'mongo';
const isMongo = !isPostgres;

module.exports = { DB_BACKEND, isPostgres, isMongo };
