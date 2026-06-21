// Knex configuration for the PostgreSQL migration (Phase 2 foundation).
// Reads the connection string from the gitignored env (PG_PROTOTYPE_URL on the
// throwaway Neon DB for now; swaps to PG_URL at production). No secret here.
// Usage (from server/):
//   npx knex migrate:latest  --knexfile db/pg/knexfile.js
//   npx knex migrate:rollback --knexfile db/pg/knexfile.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });

const connectionString = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;

module.exports = {
  client: 'pg',
  connection: { connectionString, ssl: { rejectUnauthorized: false } },
  pool: { min: 0, max: 5 },
  migrations: {
    directory: require('path').join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
};
