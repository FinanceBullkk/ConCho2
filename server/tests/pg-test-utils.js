/**
 * ──────────────────────────────────────────────────────────
 * PG test utilities — the DB_BACKEND=postgres full-suite lane (Wave G)
 * ──────────────────────────────────────────────────────────
 * The Mongo side of the test infra gives every jest file its own private
 * database (tests/setup.js → TEST_DB_NAME). Postgres has ONE shared database
 * for the whole run, so without help the suites contaminate each other AND
 * fixtures seeded via raw Mongoose never reach the ported read-paths.
 *
 * Two building blocks fix that:
 *   1. resetPgDatabase()  — truncates every app table (jest runs --runInBand,
 *      so a truncate at file-setup time gives the same per-file isolation as
 *      Mongo's private database).
 *   2. mirror*ToPg(doc)   — inserts a Mongoose-created fixture into the
 *      migrated PG tables with the SAME ObjectId-hex id (and, for users, the
 *      SAME bcrypt hash), so ported readers (auth middleware, classes, groups)
 *      see the same world on either backend.
 *
 * Every export is a NO-OP unless DB_BACKEND=postgres — converted suites can
 * call these unconditionally and stay 100% inert on the default Mongo lane.
 */
const { isPostgres } = require('../config/db-backend');
const { query } = require('../config/pg');

// Tables that belong to knex's own bookkeeping — never truncated.
const KNEX_TABLES = ["'knex_migrations'", "'knex_migrations_lock'"];

/**
 * Truncate all application tables (RESTART IDENTITY CASCADE). Called once per
 * test file from tests/setup.js — the PG twin of Mongo's per-file database.
 */
const resetPgDatabase = async () => {
  if (!isPostgres) return;
  const { rows } = await query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN (${KNEX_TABLES.join(',')})`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
};

// Row shapes live in ONE place (pg-row-mappers.js); the upsert executor lives
// in pg-auto-mirror.js. These wrappers stay for explicit fixture mirroring —
// idempotent (upsert), so they coexist with the auto-mirror plugin.
const { mirrorDoc } = require('./pg-auto-mirror');

/** Mirror a User doc into PG `users` (same ObjectId-hex id + bcrypt hash). */
const mirrorUserToPg = async (doc) => {
  if (!isPostgres) return;
  await mirrorDoc('User', doc);
};

/** Mirror a Class doc into PG `classes`. */
const mirrorClassToPg = async (doc) => {
  if (!isPostgres) return;
  await mirrorDoc('Class', doc);
};

/** Mirror a Team doc into PG `teams` + the `team_members` junction. */
const mirrorTeamToPg = async (doc) => {
  if (!isPostgres) return;
  await mirrorDoc('Team', doc);
};

/**
 * Mirror the tests/setup.js core fixtures in FK-safe order
 * (classes → users → teams → members).
 */
const mirrorCoreSeedToPg = async ({ users = [], classes = [], teams = [] }) => {
  if (!isPostgres) return;
  for (const c of classes) await mirrorClassToPg(c);
  for (const u of users) await mirrorUserToPg(u);
  for (const t of teams) await mirrorTeamToPg(t);
};

// ── Backend-agnostic assertion reads ────────────────────────
// On the pg lane the app WRITES through ported repositories (rows land in PG
// only), so a legacy `Model.findById(...)` assertion reads Mongo and sees null.
// These helpers read from the ACTIVE backend and return camelCase-keyed plain
// objects, so asserts like `row.status` / `row.enrolledUsers.length` work
// unchanged on either lane.
const { MAPPERS } = require('./pg-row-mappers');

const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelToSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const rowToCamel = (row) => {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k === 'id' ? '_id' : snakeToCamel(k)] = v;
  return out;
};

// Mongo side reads the RAW collection (driver-level) — the PG side is a raw
// SELECT, so the Mongo twin must bypass mongoose query middleware too (else
// soft-delete find-hooks hide the very rows an assertion wants to inspect).
const oid = (v) => {
  const mongoose = require('mongoose');
  return /^[0-9a-f]{24}$/i.test(String(v)) ? new mongoose.Types.ObjectId(String(v)) : v;
};

/** findById on the active backend → plain object (or null), middleware-free. */
const readActiveRow = async (modelName, id) => {
  if (!isPostgres) {
    const mongoose = require('mongoose');
    return mongoose.model(modelName).collection.findOne({ _id: oid(id) });
  }
  const { table } = MAPPERS[modelName];
  const { rows } = await query(`SELECT * FROM "${table}" WHERE id = $1`, [String(id)]);
  return rowToCamel(rows[0]);
};

/** findOne by top-level equality fields on the active backend, middleware-free. */
const findActiveRowWhere = async (modelName, where) => {
  if (!isPostgres) {
    const mongoose = require('mongoose');
    const raw = Object.fromEntries(Object.entries(where).map(([k, v]) => [k, oid(v)]));
    return mongoose.model(modelName).collection.findOne(raw);
  }
  const { table } = MAPPERS[modelName];
  const keys = Object.keys(where);
  const clause = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 1}`).join(' AND ');
  const { rows } = await query(
    `SELECT * FROM "${table}" WHERE ${clause} LIMIT 1`,
    keys.map((k) => (where[k] == null ? null : String(where[k]))),
  );
  return rowToCamel(rows[0]);
};

module.exports = {
  resetPgDatabase,
  mirrorUserToPg,
  mirrorClassToPg,
  mirrorTeamToPg,
  mirrorCoreSeedToPg,
  readActiveRow,
  findActiveRowWhere,
};
