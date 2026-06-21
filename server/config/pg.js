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
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 });
  }
  return pool;
};

const query = (text, params) => getPool().query(text, params);

const closePool = async () => { if (pool) { await pool.end(); pool = null; } };

module.exports = { getPool, query, closePool };
