// Knex configuration for the PostgreSQL migrations.
// Reads `PG_URL` from the gitignored `server/.env` (or from the shell, which
// wins — that is how CI and any disposable database are targeted). No secret
// here.
//
// SAFETY (2026-07-24): this file used to load `server/.env.pg-prototype` and
// fall back to `PG_PROTOTYPE_URL`. That env pointed at the SAME Neon database as
// production through its direct (non-pooler) hostname, so a migration run with
// no shell PG_URL silently targeted production while reading as "prototype".
// One connection source now, and the resolved target is printed before any
// migration runs — you always see which database you are about to change.
//
// Usage (from server/):
//   npx knex migrate:latest   --knexfile db/pg/knexfile.js
//   npx knex migrate:rollback --knexfile db/pg/knexfile.js
// Target a disposable database explicitly:
//   PG_URL=postgresql://postgres@127.0.0.1:5432/concho_local \
//     npx knex migrate:latest --knexfile db/pg/knexfile.js
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const connectionString = process.env.PG_URL;
if (!connectionString) {
  throw new Error('PG_URL is missing — set it in server/.env or in the shell before migrating.');
}

// SSL for managed/remote PG (Neon); off for a local/CI postgres (no SSL).
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
const ssl = isLocal ? false : { rejectUnauthorized: false };

// Migrations change data — never let the operator guess the target.
try {
  const target = new URL(connectionString);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, '')) || '(unknown)';
  console.log(`knex target: ${target.hostname} / ${dbName}${isLocal ? '' : '  [REMOTE]'}`);
} catch {
  console.log('knex target: (unparseable PG_URL)');
}

module.exports = {
  client: 'pg',
  connection: { connectionString, ssl },
  pool: { min: 0, max: 5 },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
};
