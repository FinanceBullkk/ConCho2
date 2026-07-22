/**
 * ──────────────────────────────────────────────────────────
 * PG test utilities — the (sole) Postgres test lane
 * ──────────────────────────────────────────────────────────
 * Postgres has ONE shared database for the whole run, so `resetPgDatabase()`
 * truncates every app table at file-setup time (jest runs --runInBand) — the
 * per-file isolation Mongo's private database used to give.
 *
 * The rest are ACTIVE-backend reads/writes the suites use to reverse-assert or
 * scaffold: the app writes through the ported repositories, so a test reads the
 * row back through the matching helper. `where`/`patch` keys are camelCase and
 * map to snake_case columns; `_id` maps to the `id` primary key.
 *
 * Wave K D2e-2b: the Mongo twins (mirror*ToPg, the `if (!isPostgres)` Mongoose
 * branches) were removed with `mongoose` — these are Postgres-only now.
 *
 * ── Which helper when ────────────────────────────────────────
 *   readActiveRow(model, id)          findById  → plain camelCase row (or null)
 *   findActiveRowWhere(model, where)  findOne by top-level scalar equality
 *   updateActiveRow(model, id, patch) update a row by id (camelCase → snake cols)
 *   findActiveAuditRow(filter)        latest audit row (entity/entityId/actorId/
 *                                     action[str|RegExp] + createdAt range)
 *   findActiveAuditChain()            whole seq-ordered chain (seq→Number)
 *   update/deleteActiveAuditRowBySeq  tamper/remove one audit row by seq
 */
const { query } = require('../config/pg');

// Tables that belong to knex's own bookkeeping — never truncated.
const KNEX_TABLES = ["'knex_migrations'", "'knex_migrations_lock'"];

/**
 * Truncate all application tables (RESTART IDENTITY CASCADE). Called once per
 * test file from tests/setup.js — the per-file isolation Mongo's private db gave.
 */
const resetPgDatabase = async () => {
  // SAFETY (incident 2026-07-21): this TRUNCATEs every application table. It is
  // a test-only operation. In test mode config/pg refuses any non-localhost
  // connection, so NODE_ENV==='test' guarantees the target is a local/disposable
  // Postgres — a stray call outside the suite (which would use the real PG_URL)
  // is blocked here before it can wipe production.
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetPgDatabase is test-only (NODE_ENV must be "test") — refusing to TRUNCATE.');
  }
  const { rows } = await query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN (${KNEX_TABLES.join(',')})`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);

  // Migration 043 establishes this singleton as part of the schema invariant.
  // TRUNCATE removes it, unlike normal application operation, so recreate the
  // open state after every test reset. Without this, archive status reads look
  // open but the cutover UPDATE matches no row and cannot actually freeze it.
  if (rows.some((row) => row.tablename === 'english_archive_control')) {
    await query(`
      INSERT INTO english_archive_control(singleton, is_frozen)
      VALUES (true, false)
      ON CONFLICT (singleton) DO NOTHING`);
  }
};

// ── Active-backend assertion reads ──────────────────────────
// The app WRITES through the ported repositories, so these read the same rows
// back and return camelCase-keyed plain objects (`row.status`, `row.enrolledUsers`).
const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelToSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const rowToCamel = (row) => {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k === 'id' ? '_id' : snakeToCamel(k)] = v;
  return out;
};

// Resolve a model's PG table via the explicit MAPPERS or a reflective resolver
// (so readActiveRow works for the long-tail models too).
const { tableFor } = require('./pg-table-resolver');

/** findById → plain object (or null). */
const readActiveRow = async (modelName, id) => {
  const table = await tableFor(modelName);
  const { rows } = await query(`SELECT * FROM "${table}" WHERE id = $1`, [String(id)]);
  return rowToCamel(rows[0]);
};

// Build a WHERE from top-level scalar equality. A Mongo nested path (`target.id`)
// maps to a PG flat snake column (`target_id`); a null value → `IS NULL` (SQL
// `col = NULL` is never true).
const buildScalarWhere = (where = {}) => {
  // `_id` maps to the PG primary-key column `id` (all tables use `id`).
  const col = (k) => (k === '_id' ? 'id' : camelToSnake(k.replace(/\./g, '_')));
  const conds = [];
  const args = [];
  for (const k of Object.keys(where)) {
    const v = where[k];
    if (v == null) conds.push(`"${col(k)}" IS NULL`);
    // { $in: [...] } → "col" = ANY($n); node-pg binds the JS array as a PG array.
    else if (v && typeof v === 'object' && !(v instanceof Date) && Array.isArray(v.$in)) {
      args.push(v.$in.map((x) => (x instanceof Date ? x : String(x))));
      conds.push(`"${col(k)}" = ANY($${args.length})`);
    }
    // Booleans + Dates bind natively — a stringified "false" trips PG's boolean =
    // text, and String(Date) is a locale string that won't match a timestamptz.
    // Everything else stringifies (ids/enums via text).
    else { args.push(typeof v === 'boolean' || v instanceof Date ? v : String(v)); conds.push(`"${col(k)}" = $${args.length}`); }
  }
  return { clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args };
};

/** findOne by top-level equality fields. */
const findActiveRowWhere = async (modelName, where) => {
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const { rows } = await query(`SELECT * FROM "${table}" ${clause} LIMIT 1`, args);
  return rowToCamel(rows[0]);
};

/** find MANY by top-level scalar equality → array. */
const findActiveRowsWhere = async (modelName, where = {}) => {
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const { rows } = await query(`SELECT * FROM "${table}" ${clause}`, args);
  return rows.map(rowToCamel);
};

/** count docs matching top-level scalar equality. */
const countActiveRowsWhere = async (modelName, where = {}) => {
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const { rows } = await query(`SELECT count(*)::int AS n FROM "${table}" ${clause}`, args);
  return rows[0].n;
};

/** distinct values of `field` (matching `where`) → array. */
const distinctActiveValues = async (modelName, field, where = {}) => {
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  const fcol = camelToSnake(field.replace(/\./g, '_'));
  const { rows } = await query(`SELECT DISTINCT "${fcol}" AS v FROM "${table}" ${clause}`, args);
  return rows.map((r) => r.v).filter((v) => v !== null);
};

/**
 * Delete rows matching top-level scalar equality — for between-test cleanup of a
 * row the app wrote through a ported repo. `where` keys are camelCase.
 */
const deleteActiveRowsWhere = async (modelName, where = {}) => {
  const table = await tableFor(modelName);
  const { clause, args } = buildScalarWhere(where);
  return query(`DELETE FROM "${table}" ${clause}`, args);
};

/**
 * Delete rows whose `field` starts with `prefix` — the equivalent of
 * `deleteMany({ field: /^prefix/ })`, used by suites that tag fixtures with a
 * per-file marker prefix (e.g. `PR-G-team-A`). `field` is camelCase → snake column.
 */
const deleteActiveRowsLike = async (modelName, field, prefix) => {
  const table = await tableFor(modelName);
  const col = camelToSnake(field.replace(/\./g, '_'));
  return query(`DELETE FROM "${table}" WHERE "${col}" LIKE $1`, [`${prefix}%`]);
};

/**
 * Update one row (by id) — for test scaffolding that mutates a row the app wrote
 * through a ported repository. `patch` keys are camelCase → snake columns. A
 * direct UPDATE (no timestamps plugin), so an explicit `createdAt`/`updatedAt` sticks.
 */
const updateActiveRow = async (modelName, id, patch) => {
  const table = await tableFor(modelName);
  const keys = Object.keys(patch);
  const clause = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
  return query(`UPDATE "${table}" SET ${clause} WHERE id = $1`, [String(id), ...keys.map((k) => patch[k])]);
};

/**
 * Latest audit-log row matching a Mongo-shaped filter. Supports the shapes the
 * audit suites use: entity / entityId / actorId / action (string OR RegExp → PG
 * `~` regex match) + createdAt:{$gte,$lte}. Returns a LEAN-shaped row (actorId as
 * the raw id string) so `row.actorId.toString()` and `row.action`/`row.note` hold.
 */
const findActiveAuditRow = async (filter = {}) => {
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
 * The whole seq-ordered audit chain, lean-shaped for services/audit-chain.
 * seq is a PG bigint (node-pg returns a STRING) — coerced back to Number so the
 * canonical hash payload (JSON.stringify(seq)) matches the write-time Number.
 */
const findActiveAuditChain = async () => {
  const { rows } = await query('SELECT * FROM audit_log WHERE seq IS NOT NULL ORDER BY seq ASC');
  return rows.map((r) => {
    const c = rowToCamel(r);
    if (c.seq != null) c.seq = Number(c.seq);
    return c;
  });
};

/** Tamper one audit row (by seq). `set` keys are camelCase. */
const updateActiveAuditRowBySeq = async (seq, set) => {
  const keys = Object.keys(set);
  const clause = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 2}`).join(', ');
  return query(`UPDATE audit_log SET ${clause} WHERE seq = $1`, [seq, ...keys.map((k) => set[k])]);
};

/** Delete one audit row (by seq). */
const deleteActiveAuditRowBySeq = async (seq) =>
  query('DELETE FROM audit_log WHERE seq = $1', [seq]);

/** Team member ids from the `team_members` junction. */
const readActiveTeamMemberIds = async (teamId) => {
  const { rows } = await query(`SELECT user_id FROM team_members WHERE team_id = $1`, [String(teamId)]);
  return rows.map((r) => String(r.user_id));
};

/**
 * Add a member to a team — upserts the `team_members` junction row (idempotent,
 * mirroring `$addToSet`'s dedupe).
 */
const addActiveTeamMember = async (teamId, userId) =>
  query(
    `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [String(teamId), String(userId)],
  );

/**
 * PG-native `$addToSet` for the ALLOWED_TIME_SLOTS booking setting — appends a
 * `{sh,sm,eh,em}` slot to the jsonb `value` array if absent. Booking suites use
 * this to guarantee their slot exists before booking it (the setting is seeded).
 */
const addAllowedTimeSlot = async (slot) => {
  const s = await findActiveRowWhere('Setting', { key: 'ALLOWED_TIME_SLOTS' });
  const slots = Array.isArray(s && s.value) ? s.value : [];
  const has = slots.some((v) => v.sh === slot.sh && v.sm === slot.sm && v.eh === slot.eh && v.em === slot.em);
  if (has) return undefined;
  slots.push(slot);
  return updateActiveRow('Setting', s._id, { value: JSON.stringify(slots) });
};

/**
 * Poll an async producer until it returns a truthy value (or time out) — for
 * fire-and-forget writes (audit rows) that a fixed sleep races under full-suite/
 * CI load. Returns the first truthy value, or the LAST value after timeoutMs.
 */
const pollUntil = async (fn, { timeoutMs = 3000, stepMs = 50 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const out = await fn();
    if (out || Date.now() > deadline) return out;
    await new Promise((r) => setTimeout(r, stepMs));
  }
};

module.exports = {
  pollUntil,
  resetPgDatabase,
  readActiveRow,
  findActiveRowWhere,
  findActiveRowsWhere,
  countActiveRowsWhere,
  distinctActiveValues,
  deleteActiveRowsWhere,
  deleteActiveRowsLike,
  updateActiveRow,
  addAllowedTimeSlot,
  readActiveTeamMemberIds,
  addActiveTeamMember,
  findActiveAuditRow,
  findActiveAuditChain,
  updateActiveAuditRowBySeq,
  deleteActiveAuditRowBySeq,
};
