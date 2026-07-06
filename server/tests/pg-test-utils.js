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
 *
 * ── Which helper when (reverse-assert / scaffolding on the pg lane) ──────────
 *   readActiveRow(model, id)          findById  → plain camelCase row (or null)
 *   findActiveRowWhere(model, where)  findOne by top-level scalar equality
 *   updateActiveRow(model, id, patch) update a PG-only row a Mongoose write would
 *                                     miss (patch keys camelCase → snake columns)
 *   findActiveAuditRow(filter)        latest audit row (entity/entityId/actorId/
 *                                     action[str|RegExp] + createdAt range)
 *   findActiveAuditChain()            whole seq-ordered chain (seq→Number)
 *   update/deleteActiveAuditRowBySeq  tamper/remove one audit row by seq
 * Rule of thumb: the app writes through a ported repo (PG only) → a Mongoose
 * read/write sees stale/empty; route the assertion (or scaffolding mutation)
 * through the matching helper so it hits the ACTIVE backend on either lane.
 * NOTE: raw `Model.collection.updateOne(...)` in APP code bypasses the auto-mirror
 * entirely (softDeleteEmpCodeReuse) — that needs the raw-collection mirror patch,
 * not one of these helpers.
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

// Resolve a model's PG table via the explicit MAPPERS or the auto-mirror's
// reflective resolver (so readActiveRow works for the long-tail models too).
const { tableFor } = require('./pg-auto-mirror');

/** findById on the active backend → plain object (or null), middleware-free. */
const readActiveRow = async (modelName, id) => {
  if (!isPostgres) {
    const mongoose = require('mongoose');
    return mongoose.model(modelName).collection.findOne({ _id: oid(id) });
  }
  const table = await tableFor(modelName);
  const { rows } = await query(`SELECT * FROM "${table}" WHERE id = $1`, [String(id)]);
  return rowToCamel(rows[0]);
};

// Build a WHERE from top-level scalar equality. A Mongo nested path (`target.id`)
// maps to a PG flat snake column (`target_id`); a null value → `IS NULL` (SQL
// `col = NULL` is never true). The Mongo twin passes the raw filter to the driver.
const buildScalarWhere = (where = {}) => {
  const col = (k) => camelToSnake(k.replace(/\./g, '_'));
  const conds = [];
  const args = [];
  for (const k of Object.keys(where)) {
    if (where[k] == null) conds.push(`"${col(k)}" IS NULL`);
    else { args.push(String(where[k])); conds.push(`"${col(k)}" = $${args.length}`); }
  }
  return { clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args };
};
const mongoFilter = (where) => Object.fromEntries(Object.entries(where).map(([k, v]) => [k, oid(v)]));

/** findOne by top-level equality fields on the active backend, middleware-free. */
const findActiveRowWhere = async (modelName, where) => {
  if (!isPostgres) return require('mongoose').model(modelName).collection.findOne(mongoFilter(where));
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const { rows } = await query(`SELECT * FROM "${table}" ${clause} LIMIT 1`, args);
  return rowToCamel(rows[0]);
};

/** find MANY by top-level scalar equality on the active backend → array. */
const findActiveRowsWhere = async (modelName, where = {}) => {
  if (!isPostgres) return require('mongoose').model(modelName).collection.find(mongoFilter(where)).toArray();
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const { rows } = await query(`SELECT * FROM "${table}" ${clause}`, args);
  return rows.map(rowToCamel);
};

/** count docs matching top-level scalar equality on the ACTIVE backend. */
const countActiveRowsWhere = async (modelName, where = {}) => {
  if (!isPostgres) return require('mongoose').model(modelName).collection.countDocuments(mongoFilter(where));
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const { rows } = await query(`SELECT count(*)::int AS n FROM "${table}" ${clause}`, args);
  return rows[0].n;
};

/** distinct values of `field` (matching `where`) on the ACTIVE backend → array. */
const distinctActiveValues = async (modelName, field, where = {}) => {
  if (!isPostgres) return require('mongoose').model(modelName).collection.distinct(field, mongoFilter(where));
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const fcol = camelToSnake(field.replace(/\./g, '_'));
  const { rows } = await query(`SELECT DISTINCT "${fcol}" AS v FROM "${table}" ${clause}`, args);
  return rows.map((r) => r.v).filter((v) => v !== null);
};

/**
 * Update one row (by id) on the ACTIVE backend — for test scaffolding that
 * mutates a row the app wrote through a ported repository (PG-only), which a
 * Mongoose Model.findByIdAndUpdate would miss. `patch` keys are camelCase and map
 * to snake columns on PG. On Mongo it runs the equivalent findByIdAndUpdate.
 */
const updateActiveRow = async (modelName, id, patch) => {
  if (!isPostgres) {
    const mongoose = require('mongoose');
    return mongoose.model(modelName).findByIdAndUpdate(id, { $set: patch });
  }
  const table = await tableFor(modelName);
  const keys = Object.keys(patch);
  const clause = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
  return query(`UPDATE "${table}" SET ${clause} WHERE id = $1`, [String(id), ...keys.map((k) => patch[k])]);
};

/**
 * Latest audit-log row matching a Mongo-shaped filter, from the ACTIVE backend.
 * Mirrors `AuditLog.findOne(filter).sort('-createdAt').lean()`. On the pg lane
 * the app writes audit rows through the DB_BACKEND-selected repository (PG only),
 * so a Mongoose read sees nothing — this reads the right backend.
 *
 * Supports the filter shapes the audit suites use: entity / entityId / actorId /
 * action (string OR RegExp → PG `~` regex match) + createdAt:{$gte,$lte}. Returns
 * a LEAN-shaped row (actorId as the raw id string, NOT populated) so both
 * `row.actorId.toString()` and `row.action`/`row.note` asserts hold on either lane.
 */
const findActiveAuditRow = async (filter = {}) => {
  if (!isPostgres) {
    const AuditLog = require('../models/AuditLog');
    return AuditLog.findOne(filter).sort('-createdAt').lean();
  }
  const conds = [];
  const args = [];
  const COL = { entity: 'entity', entityId: 'entity_id', actorId: 'actor_id', action: 'action' };
  for (const [k, col] of Object.entries(COL)) {
    const v = filter[k];
    if (v == null) continue;
    if (v instanceof RegExp) { args.push(v.source); conds.push(`"${col}" ~ $${args.length}`); }
    else { args.push(String(v)); conds.push(`"${col}" = $${args.length}`); }
  }
  if (filter.createdAt && filter.createdAt.$gte) { args.push(filter.createdAt.$gte); conds.push(`created_at >= $${args.length}`); }
  if (filter.createdAt && filter.createdAt.$lte) { args.push(filter.createdAt.$lte); conds.push(`created_at <= $${args.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC, seq DESC NULLS LAST LIMIT 1`,
    args,
  );
  return rowToCamel(rows[0]);
};

/**
 * The whole seq-ordered audit chain from the ACTIVE backend, lean-shaped for
 * services/audit-chain.computeHash. Mirrors
 * `AuditLog.find({ seq: { $exists: true } }).sort({ seq: 1 }).lean()`.
 * seq is a PG bigint (node-pg returns a STRING) — coerced back to Number so the
 * canonical hash payload (JSON.stringify(seq)) matches the write-time Number.
 */
const findActiveAuditChain = async () => {
  if (!isPostgres) {
    const AuditLog = require('../models/AuditLog');
    return AuditLog.find({ seq: { $exists: true } }).sort({ seq: 1 }).lean();
  }
  const { rows } = await query('SELECT * FROM audit_log WHERE seq IS NOT NULL ORDER BY seq ASC');
  return rows.map((r) => {
    const c = rowToCamel(r);
    if (c.seq != null) c.seq = Number(c.seq);
    return c;
  });
};

/** Tamper one audit row (by seq) on the ACTIVE backend. `set` keys are camelCase. */
const updateActiveAuditRowBySeq = async (seq, set) => {
  if (!isPostgres) {
    const AuditLog = require('../models/AuditLog');
    return AuditLog.updateOne({ seq }, { $set: set });
  }
  const keys = Object.keys(set);
  const clause = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
  return query(`UPDATE audit_log SET ${clause} WHERE seq = $1`, [seq, ...keys.map((k) => set[k])]);
};

/** Delete one audit row (by seq) on the ACTIVE backend. */
const deleteActiveAuditRowBySeq = async (seq) => {
  if (!isPostgres) {
    const AuditLog = require('../models/AuditLog');
    return AuditLog.deleteOne({ seq });
  }
  return query('DELETE FROM audit_log WHERE seq = $1', [seq]);
};

module.exports = {
  resetPgDatabase,
  mirrorUserToPg,
  mirrorClassToPg,
  mirrorTeamToPg,
  mirrorCoreSeedToPg,
  readActiveRow,
  findActiveRowWhere,
  findActiveRowsWhere,
  countActiveRowsWhere,
  distinctActiveValues,
  updateActiveRow,
  findActiveAuditRow,
  findActiveAuditChain,
  updateActiveAuditRowBySeq,
  deleteActiveAuditRowBySeq,
};
