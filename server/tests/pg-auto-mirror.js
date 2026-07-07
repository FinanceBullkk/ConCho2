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
const mongoose = require('mongoose');
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
// Models with NO table (CronRun/ReconcileReport — Mongo-only ops; reconcile
// RETIRES at cutover) fall through to warnOnce. Counter gained a PG table in
// mig 033 (Phase-5 slice 2) — its `id` PK is the counter NAME, so fixture
// writes/deletes (reconcileDrift's beforeEach reset) reflect correctly.
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
  // (Mongo-only ops models like CronRun / ReconcileReport).
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
    if (res && res._id) ids.add(String(res._id)); // upsert-created doc (with {new:true})
    // Also re-run the CURRENT filter: an upsert-create WITHOUT {new:true} returns
    // a null res and matched no pre-ids, so the new doc is only reachable via the
    // filter it was created under (finance seeds LND_COST_CONFIG this way).
    const byFilter = await this.model.find(this.getFilter()).select('_id').lean();
    for (const r of byFilter) ids.add(String(r._id));
    if (ids.size === 0) return;
    // Re-read by id via the RAW driver collection so a JUST-soft-deleted doc
    // (whose isDeleted flipped to true in THIS update) is still returned. A
    // mongoose find() would apply the model's soft-delete pre-find hook and hide
    // it, so the is_deleted=true transition would never mirror to PG (DATA-009).
    const objIds = [...ids].map((s) => (/^[0-9a-f]{24}$/i.test(s) ? new mongoose.Types.ObjectId(s) : s));
    const docs = await this.model.collection.find({ _id: { $in: objIds } }).toArray();
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

// ── Raw-driver collection mirror ─────────────────────────────
// The schema plugin above only covers Mongoose model/query writes. App + test
// code sometimes writes through the RAW driver collection
// (`Model.collection.updateOne/insertOne/…`) to bypass Mongoose middleware — e.g.
// `deleteUser` mutates empCode/isDeleted past the soft-delete find-filter, and
// several suites backdate `createdAt` or plant docs the same way. Those raw writes
// fire NO schema hook, so nothing reaches PG (softDeleteEmpCodeReuse 500,
// complianceMatrix, learningAssignmentRoutes). Patch NativeCollection's write
// methods to mirror them too.
//
// Installed ONLY on the pg lane (from registerAutoMirror when isPostgres) → zero
// effect on the Mongo gate. Mongoose-internal ops also flow through these methods
// and get mirrored a second time on top of the schema hook — harmless: every
// mirror is an idempotent upsert / delete-by-id. Fail-SOFT: a mirror error never
// breaks the underlying driver write.
const NativeCollection = require('mongoose/lib/drivers/node-mongodb-native/collection');

let COLL_TO_MODEL = null; // built lazily on first raw write (models compiled by then)
const modelForCollection = (collectionName) => {
  if (!COLL_TO_MODEL || !COLL_TO_MODEL.has(collectionName)) {
    COLL_TO_MODEL = new Map();
    for (const name of Object.keys(mongoose.models)) {
      const c = mongoose.models[name].collection;
      if (c && c.collectionName) COLL_TO_MODEL.set(c.collectionName, name);
    }
  }
  return COLL_TO_MODEL.get(collectionName) || null;
};

// Raw _id capture (ObjectIds), session-aware so a write inside a Mongoose
// transaction re-reads its own uncommitted rows.
const rawFindIds = async (coll, filter, session) => {
  const rows = await coll.find(filter, session ? { session } : undefined).project({ _id: 1 }).toArray();
  return rows.map((r) => r._id);
};

const patchRawCollectionWrites = () => {
  const proto = NativeCollection.prototype;
  if (proto.__pgMirrorPatched) return;
  proto.__pgMirrorPatched = true;

  const wrapUpdate = (name) => {
    const orig = proto[name];
    proto[name] = async function pgMirrorUpdate(filter, update, options, ...rest) {
      const modelName = modelForCollection(this.collectionName);
      if (!modelName) return orig.call(this, filter, update, options, ...rest);
      const session = options && options.session;
      let ids = [];
      try { ids = await rawFindIds(this, filter, session); } catch (_) { /* fail-soft */ }
      const res = await orig.call(this, filter, update, options, ...rest);
      try {
        if (res && res.upsertedId) ids.push(res.upsertedId._id || res.upsertedId);
        if (ids.length) {
          const docs = await this.find({ _id: { $in: ids } }, session ? { session } : undefined).toArray();
          for (const doc of docs) await mirrorDoc(modelName, doc);
        }
      } catch (e) { warnOnce(`${modelName} (raw ${name} mirror skipped: ${e.code || e.message})`); }
      return res;
    };
  };

  const wrapDelete = (name) => {
    const orig = proto[name];
    proto[name] = async function pgMirrorDelete(filter, options, ...rest) {
      const modelName = modelForCollection(this.collectionName);
      if (!modelName) return orig.call(this, filter, options, ...rest);
      const session = options && options.session;
      const isEmpty = !filter || Object.keys(filter).length === 0;
      let ids = [];
      if (!isEmpty) { try { ids = (await rawFindIds(this, filter, session)).map(String); } catch (_) { /* fail-soft */ } }
      const res = await orig.call(this, filter, options, ...rest);
      try {
        if (isEmpty) {
          const mapper = MAPPERS[modelName];
          if (mapper && mapper.junction) await query(`DELETE FROM "${mapper.junction.table}"`);
          const table = await tableFor(modelName);
          if (table) await query(`DELETE FROM "${table}"`);
        } else {
          await deleteRows(modelName, ids);
        }
      } catch (e) { warnOnce(`${modelName} (raw ${name} mirror skipped: ${e.code || e.message})`); }
      return res;
    };
  };

  const origInsertOne = proto.insertOne;
  proto.insertOne = async function pgMirrorInsertOne(doc, options, ...rest) {
    const modelName = modelForCollection(this.collectionName);
    const res = await origInsertOne.call(this, doc, options, ...rest);
    if (modelName) {
      try { await mirrorDoc(modelName, doc); } catch (e) { warnOnce(`${modelName} (raw insertOne mirror skipped: ${e.code || e.message})`); }
    }
    return res;
  };

  const origInsertMany = proto.insertMany;
  proto.insertMany = async function pgMirrorInsertMany(docs, options, ...rest) {
    const modelName = modelForCollection(this.collectionName);
    const res = await origInsertMany.call(this, docs, options, ...rest);
    if (modelName && Array.isArray(docs)) {
      for (const doc of docs) { try { await mirrorDoc(modelName, doc); } catch (e) { warnOnce(`${modelName} (raw insertMany mirror skipped: ${e.code || e.message})`); } }
    }
    return res;
  };

  wrapUpdate('updateOne');
  wrapUpdate('updateMany');
  wrapDelete('deleteOne');
  wrapDelete('deleteMany');
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
  patchRawCollectionWrites();
};

module.exports = { registerAutoMirror, mirrorDoc, tableFor };
