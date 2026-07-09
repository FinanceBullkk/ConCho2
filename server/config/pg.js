// PostgreSQL connection pool (PG-migration Phase 2 foundation).
// Mirrors config/db.js (Mongo) for the relational backend. Lazy, pooled, SSL
// for Neon. Reads the connection string from env (PG_URL in production; the
// gitignored PG_PROTOTYPE_URL during the spike). No secret here.
//
// Inert until DB_BACKEND=postgres routes a repository here (Phase 3) — importing
// this module does NOT open a connection; getPool() does, on first use.
const { Pool } = require('pg');

let pool = null;

const getPool = () => {
  if (!pool) {
    const connectionString = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
    if (!connectionString) throw new Error('PG connection string missing (PG_URL / PG_PROTOTYPE_URL)');
    // SSL for managed/remote PG (Neon); off for a local/CI postgres (no SSL).
    const ssl = /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false };
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
