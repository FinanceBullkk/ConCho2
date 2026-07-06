/**
 * ──────────────────────────────────────────────────────────
 * Mongoose → PG auto-mirror plugin (Wave G batch 2 — test-only)
 * ──────────────────────────────────────────────────────────
 * On the DB_BACKEND=postgres lane, legacy suites seed fixtures with raw
 * Mongoose while the app's ported repositories read PG. Instead of editing
 * ~80 suites, tests/setup.js registers this GLOBAL mongoose plugin (at module
 * load, BEFORE any model compiles): every write on a mapped model is mirrored
 * into the migrated PG table.
 *
 *   create()/save()          → upsert the doc's row
 *   insertMany()             → upsert each row
 *   findOneAndUpdate/update* → pre: capture matching _ids; post: re-read those
 *                              docs from Mongo and upsert (avoids re-deriving
 *                              update-operator semantics)
 *   findOneAndDelete/delete* → pre: capture matching _ids; post: DELETE them
 *
 * Fail-LOUD by design: a broken mirror insert must surface here, not as a
 * mystery assertion three layers up. Unmapped models warn once and are
 * skipped (Setting is intentionally unmapped — its reads are Mongo-direct).
 * Registered only when DB_BACKEND=postgres; otherwise this module is inert.
 */
const { isPostgres } = require('../config/db-backend');
const { query } = require('../config/pg');
const { MAPPERS, toRow } = require('./pg-row-mappers');

// Models whose reads are NOT ported (Mongo-direct) — no mirror, no warning.
const SKIP_MODELS = new Set([]);

const warned = new Set();
const warnOnce = (name) => {
  if (SKIP_MODELS.has(name) || warned.has(name)) return;
  warned.add(name);
  // eslint-disable-next-line no-console
  console.warn(`[pg-auto-mirror] no row-mapper for model "${name}" — writes NOT mirrored to PG`);
};

// ── Generic reflective mapper (long tail) ───────────────────
// Explicit MAPPERS win; any OTHER model with a PG table is mirrored by
// reflecting the table's columns and coercing doc fields by column type. This
// covers the ~20 low-frequency domain models (vendor/skill/trainer/automation/
// learning-path/finance/room/waitlist/…) without a hand-written entry each.
// Models with NO table (Counter/CronRun/ReconcileReport — Mongo-only ops) fall
// through to warnOnce.
let PG_TABLES = null;                 // Set<tableName>
const PG_COLS = new Map();            // table → [ [column, dataType], … ]
const TABLE_FOR_MODEL = new Map();    // modelName → tableName | null (cached)

const loadTables = async () => {
  if (PG_TABLES) return;
  const { rows } = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  PG_TABLES = new Set(rows.map((r) => r.table_name));
};
const loadCols = async (table) => {
  if (PG_COLS.has(table)) return PG_COLS.get(table);
  const { rows } = await query(
    'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1', [table]);
  const cols = rows.map((r) => [r.column_name, r.data_type]);
  PG_COLS.set(table, cols);
  return cols;
};
const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const toCamelCol = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const resolveTable = (modelName) => {
  if (TABLE_FOR_MODEL.has(modelName)) return TABLE_FOR_MODEL.get(modelName);
  const s = toSnake(modelName);
  const candidates = [`${s}s`, `${s}es`, s, s.replace(/y$/, 'ies')];
  const hit = candidates.find((c) => PG_TABLES.has(c)) || null;
  TABLE_FOR_MODEL.set(modelName, hit);
  return hit;
};
// Coerce one value to its PG column type: ids → hex string, text[]/jsonb-array
// stringify appropriately, everything else passes through (node-pg serializes
// timestamps/objects/scalars).
const coerceCol = (col, type, v) => {
  if (v == null) return v;
  if (col === 'id' || col.endsWith('_id')) return String(v);
  if (type === 'ARRAY') return Array.isArray(v) ? v.map(String) : v;
  if (type === 'jsonb') return Array.isArray(v) ? JSON.stringify(v) : v;
  return v;
};
const genericRow = (doc, cols) => {
  const row = {};
  for (const [col, type] of cols) {
    let v = col === 'id' ? doc._id : doc[toCamelCol(col)];
    if (v === undefined) {
      if (col === 'created_at' || col === 'updated_at') v = new Date();
      else if (col === 'is_deleted') v = false;
      else v = null;
    }
    row[col] = coerceCol(col, type, v);
  }
  return row;
};

/** UPSERT one full row: INSERT … ON CONFLICT (id) DO UPDATE every column. */
const upsertRow = async (table, row) => {
  const cols = Object.keys(row);
  const params = cols.map((_, i) => `$${i + 1}`);
  const updates = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`);
  await query(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')})
     VALUES (${params.join(',')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
    cols.map((c) => row[c]),
  );
};

/** Mirror one doc (hydrated or lean) of a model into PG. */
const mirrorDoc = async (modelName, doc) => {
  // Some Mongoose ops fire hooks with no resolvable modelName (subdoc/embedded
  // schemas). Skip them — no model, nothing to mirror (matches pre-generic
  // behaviour; without this guard toSnake(undefined) would throw).
  if (!modelName || !doc) return;
  const mapper = MAPPERS[modelName];
  const d = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: false }) : doc;
  // No explicit mapper → reflect the PG table (long tail). No table → warn+skip
  // (Mongo-only ops models like Counter / CronRun / ReconcileReport).
  if (!mapper) {
    await loadTables();
    const table = resolveTable(modelName);
    if (!table) return warnOnce(modelName);
    // The reflective row is HEURISTIC (snake⟷camel by convention) — a renamed
    // or nested model field (e.g. SessionType `order`→display_order) reflects to
    // undefined → NULL and can trip a NOT NULL column. Fail SOFT here: a bad
    // generic mirror must never break the Mongoose write it rides on (explicit
    // MAPPERS stay fail-loud). The row simply isn't mirrored; add an explicit
    // mapper if that model's PG reads are asserted.
    try {
      await upsertRow(table, genericRow(d, await loadCols(table)));
    } catch (e) {
      warnOnce(`${modelName} (generic mirror skipped: ${e.code || e.message})`);
    }
    return;
  }
  // select:false fields (User.password) exist in-memory right after create/save
  // but vanish from toObject on later reads — patch them back from the doc.
  if (modelName === 'User' && d.password === undefined && doc.password !== undefined) d.password = doc.password;
  await upsertRow(mapper.table, toRow(modelName, d));
  if (mapper.junction) {
    const { table, sync } = mapper.junction;
    const j = sync(d);
    await query(`DELETE FROM "${table}" WHERE team_id = $1`, [j.team_id]);
    if (j.user_ids.length) {
      await query(
        `INSERT INTO "${table}" (team_id, user_id) VALUES ${j.user_ids.map((_, i) => `($1,$${i + 2})`).join(',')}`,
        [j.team_id, ...j.user_ids],
      );
    }
  }
};

// Resolve a model's table (explicit mapper first, else reflected). Null when
// the model has no PG table (Mongo-only). Used by both delete paths.
const tableFor = async (modelName) => {
  if (!modelName) return null;
  if (MAPPERS[modelName]) return MAPPERS[modelName].table;
  await loadTables();
  return resolveTable(modelName);
};

const deleteRows = async (modelName, idList) => {
  if (idList.length === 0) return;
  const mapper = MAPPERS[modelName];
  if (mapper && mapper.junction) await query(`DELETE FROM "${mapper.junction.table}" WHERE team_id = ANY($1)`, [idList]);
  const table = await tableFor(modelName);
  if (table) await query(`DELETE FROM "${table}" WHERE id = ANY($1)`, [idList]);
};

const UPDATE_OPS = ['findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'updateOne', 'updateMany'];
const DELETE_OPS = ['findOneAndDelete', 'deleteOne', 'deleteMany'];

/** The global plugin — attached to every schema compiled after registration. */
const autoMirrorPlugin = (schema) => {
  schema.post('save', async function () {
    await mirrorDoc(this.constructor.modelName, this);
  });

  schema.post('insertMany', async function (docs) {
    for (const doc of docs) await mirrorDoc(this.modelName, doc);
  });

  // Query writes: capture the affected ids BEFORE the op (the filter may stop
  // matching after), then re-read the final docs and upsert / delete by id.
  schema.pre(UPDATE_OPS.concat(DELETE_OPS), async function () {
    const found = await this.model.find(this.getFilter()).select('_id').lean();
    this.__mirrorIds = found.map((r) => String(r._id));
  });

  schema.post(UPDATE_OPS, async function (res) {
    const ids = new Set(this.__mirrorIds || []);
    if (res && res._id) ids.add(String(res._id)); // upsert-created doc
    if (ids.size === 0) return;
    const docs = await this.model.find({ _id: { $in: [...ids] } }).lean();
    for (const doc of docs) await mirrorDoc(this.model.modelName, doc);
  });

  schema.post(DELETE_OPS, async function () {
    const modelName = this.model.modelName;
    // `deleteMany({})` is the standard between-test cleanup idiom. The rows it
    // must clear may exist ONLY in PG (written by the app through a ported
    // repository, invisible to Mongo) — so an empty filter wipes the whole PG
    // table, not just the Mongo-captured ids.
    if (Object.keys(this.getFilter()).length === 0) {
      const mapper = MAPPERS[modelName];
      if (mapper && mapper.junction) await query(`DELETE FROM "${mapper.junction.table}"`);
      const table = await tableFor(modelName);
      if (!table) return warnOnce(modelName);
      await query(`DELETE FROM "${table}"`);
      return;
    }
    await deleteRows(modelName, this.__mirrorIds || []);
  });
};

/** Register globally — call BEFORE any model file is required (setup.js load). */
const registerAutoMirror = (mongoose) => {
  if (!isPostgres) return;
  if (Object.keys(mongoose.models).length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pg-auto-mirror] models already compiled before registration: ${Object.keys(mongoose.models).join(', ')} — their writes will NOT be mirrored`,
    );
  }
  mongoose.plugin(autoMirrorPlugin);
};

module.exports = { registerAutoMirror, mirrorDoc, tableFor };
