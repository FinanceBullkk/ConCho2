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
  const mapper = MAPPERS[modelName];
  if (!mapper) return warnOnce(modelName);
  const d = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: false }) : doc;
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

const deleteRows = async (modelName, idList) => {
  const mapper = MAPPERS[modelName];
  if (!mapper || idList.length === 0) return;
  if (mapper.junction) await query(`DELETE FROM "${mapper.junction.table}" WHERE team_id = ANY($1)`, [idList]);
  await query(`DELETE FROM "${mapper.table}" WHERE id = ANY($1)`, [idList]);
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
      if (!mapper) return warnOnce(modelName);
      if (mapper.junction) await query(`DELETE FROM "${mapper.junction.table}"`);
      await query(`DELETE FROM "${mapper.table}"`);
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

module.exports = { registerAutoMirror, mirrorDoc };
