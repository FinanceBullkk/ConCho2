// PostgreSQL connection pool (PG-migration Phase 2 foundation).
// Mirrors config/db.js (Mongo) for the relational backend. Lazy, pooled, SSL
// for Neon. Reads the connection string from env (PG_URL in production; the
// gitignored PG_PROTOTYPE_URL during the spike). No secret here.
//
// Inert until DB_BACKEND=postgres routes a repository here (Phase 3) — importing
// this module does NOT open a connection; getPool() does, on first use.
const { Pool } = require('pg');

let pool = null;

// A connection string is "local" (disposable) when it points at loopback —
// Docker Postgres on the dev machine or the CI postgres service. Anything else
// (Neon, any managed host) is treated as production-grade and NEVER truncated.
const isLocalConnection = (url) => /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

/**
 * Resolve the connection string for the current process.
 *
 * SAFETY (incident 2026-07-21): the Jest harness TRUNCATEs every table on the
 * active connection (tests/pg-test-utils.resetPgDatabase). Before this guard,
 * config used `PG_URL || PG_PROTOTYPE_URL` for BOTH the app and the test lane,
 * so running the suite locally with a Neon PG_URL wiped production. In test
 * mode we now connect ONLY to a local/disposable Postgres (PG_TEST_URL, or a
 * localhost PG_URL as CI uses) and FAIL CLOSED on anything remote — the suite
 * refuses to run rather than risk a remote database.
 */
const getConnectionString = () => {
  if (process.env.NODE_ENV === 'test') {
    const url = process.env.PG_TEST_URL || process.env.PG_URL;
    if (!url) {
      throw new Error(
        'Test mode needs a local Postgres: set PG_TEST_URL (Docker) — see server/.env.example.',
      );
    }
    if (!isLocalConnection(url)) {
      throw new Error(
        'Refusing to run tests against a non-localhost Postgres — the test harness ' +
          'TRUNCATEs every table. Point PG_TEST_URL at a local/Docker DB (incident 2026-07-21).',
      );
    }
    return url;
  }
  const connectionString = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
  if (!connectionString) throw new Error('PG connection string missing (PG_URL / PG_PROTOTYPE_URL)');
  return connectionString;
};

const getPool = () => {
  if (!pool) {
    const connectionString = getConnectionString();
    // SSL for managed/remote PG (Neon); off for a local/CI postgres (no SSL).
    const ssl = isLocalConnection(connectionString) ? false : { rejectUnauthorized: false };
    pool = new Pool({ connectionString, ssl, max: 5 });
  }
  return pool;
};

const query = (text, params) => getPool().query(text, params);

// Liveness probe for /ready + boot verify (K1b): a cheap round-trip that opens
// the pool on first use. Throws if PG is unreachable.
const ping = async () => { await query('SELECT 1'); return true; };

const closePool = async () => { if (pool) { await pool.end(); pool = null; } };

module.exports = { getPool, query, ping, closePool };
