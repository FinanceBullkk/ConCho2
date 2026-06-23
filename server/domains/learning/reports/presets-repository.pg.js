const crypto = require('crypto');
const { query } = require('../../../config/pg');

// ──────────────────────────────────────────────────────────
// learning/reports/presets-repository — POSTGRES impl. Same interface as
// ./presets-repository.mongo. Saved report-preset CRUD.
//
// Fidelity notes the parity test pins:
//   • soft-delete is explicit (is_deleted=false) on every read/update (the model
//     has pre-hooks that auto-filter); isDeleted/deletedAt are select:false →
//     omitted from the row mapper.
//   • `filters` subdoc → jsonb; create/replace apply the Mongoose subdoc defaults
//     (from/to/role '', departmentId null, programIds []) so a partial payload
//     lands identically; ObjectId fields stored/read as hex strings.
//   • create defaults kind='evidence', schedule='none'; list sort updatedAt desc,
//     limit 200.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Mirror the Mongoose `filters` subdoc defaults so a partial payload is filled.
const normFilters = (f = {}) => ({
  from: f.from == null ? '' : f.from,
  to: f.to == null ? '' : f.to,
  departmentId: f.departmentId == null ? null : String(f.departmentId),
  role: f.role == null ? '' : f.role,
  programIds: (f.programIds || []).map(String),
});

const presetRow = (r) => (r == null ? null : {
  _id: r.id, name: r.name, kind: r.kind, filters: r.filters || {}, schedule: r.schedule,
  createdBy: r.created_by || null, createdAt: r.created_at, updatedAt: r.updated_at,
});

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO report_presets(id, name, kind, filters, schedule, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      newId(), data.name, data.kind == null ? 'evidence' : data.kind,
      JSON.stringify(normFilters(data.filters)), data.schedule == null ? 'none' : data.schedule,
      data.createdBy == null ? null : String(data.createdBy),
    ]);
  return presetRow(rows[0]);
};

const list = async () => {
  const { rows } = await query(
    `SELECT * FROM report_presets WHERE is_deleted = false ORDER BY updated_at DESC LIMIT 200`);
  return rows.map(presetRow);
};

const findById = async (id) => {
  const { rows } = await query(`SELECT * FROM report_presets WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? presetRow(rows[0]) : null;
};

const COL = { name: 'name', kind: 'kind', filters: 'filters', schedule: 'schedule' };
// On update, Mongo `$set: {filters:{...}}` REPLACES the subdoc WITHOUT applying
// subdoc defaults (unlike create) — store the patch's filters verbatim (ObjectId
// values serialize to hex strings via JSON.stringify), no normFilters.
const colVal = (k, v) => (k === 'filters' ? JSON.stringify(v == null ? {} : v) : v);

const updateById = async (id, patch) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(COL)) {
    if (hasOwn(patch, k)) { args.push(colVal(k, patch[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE report_presets SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? presetRow(rows[0]) : null;
};

const softDeleteById = async (id) => {
  const { rows } = await query(
    `UPDATE report_presets SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return rows[0] ? presetRow(rows[0]) : null;
};

module.exports = { create, list, findById, updateById, softDeleteById };
