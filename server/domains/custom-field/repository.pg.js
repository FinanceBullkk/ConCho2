const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// custom-field/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Custom field definitions CRUD + drag-reorder.
//
// Fidelity notes the parity test pins:
//   • soft-delete is an EXPLICIT predicate (is_deleted=false) on every read/update.
//   • create applies the Mongoose defaults (entity Program, type text, options [],
//     showIn ['form'], required false, order 0) and lowercases/trims the key, so a
//     minimal payload lands identically on both backends.
//   • the (entity,key) live-row unique violation (23505) maps to a Mongo-style
//     { code: 11000 } so use-cases.js#asConflict surfaces the same 409.
//   • `order` is SQL-reserved → stored as display_order, mapped back to `order`.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const cfdRow = (r) => (r == null ? null : {
  _id: r.id, entity: r.entity, key: r.key, label: r.label, type: r.type,
  options: (r.options || []).map(String), showIn: r.show_in || [],
  required: r.required, order: r.display_order == null ? 0 : Number(r.display_order),
  isDeleted: r.is_deleted, deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at,
});

const duplicateError = () => {
  const e = new Error('A field with this key already exists for this entity');
  e.code = 11000;
  return e;
};

const list = async ({ entity } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (entity) { args.push(entity); conds.push(`entity = $${args.length}`); }
  const { rows } = await query(
    `SELECT * FROM custom_field_definitions WHERE ${conds.join(' AND ')}
      ORDER BY entity ASC, display_order ASC, created_at ASC`, args);
  return rows.map(cfdRow);
};

const create = async (data) => {
  const key = data.key == null ? data.key : String(data.key).trim().toLowerCase();
  const label = data.label == null ? data.label : String(data.label).trim();
  try {
    const { rows } = await query(
      `INSERT INTO custom_field_definitions(id,entity,key,label,type,options,show_in,required,display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        newId(), data.entity == null ? 'Program' : data.entity, key, label,
        data.type == null ? 'text' : data.type,
        (data.options || []).map(String),
        data.showIn == null ? ['form'] : data.showIn,
        data.required == null ? false : data.required,
        data.order == null ? 0 : data.order,
      ]);
    return cfdRow(rows[0]);
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const findByIdLean = async (id) => {
  const { rows } = await query(`SELECT * FROM custom_field_definitions WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? cfdRow(rows[0]) : null;
};

const COL = {
  entity: 'entity', key: 'key', label: 'label', type: 'type',
  options: 'options', showIn: 'show_in', required: 'required', order: 'display_order',
};
const colVal = (k, v) => {
  if (k === 'key') return v == null ? v : String(v).trim().toLowerCase();
  if (k === 'label') return v == null ? v : String(v).trim();
  if (k === 'options') return (v || []).map(String);
  if (k === 'showIn') return v || [];
  return v;
};

const updateById = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(COL)) {
    if (hasOwn(data, k)) { args.push(colVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findByIdLean(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  try {
    const { rows } = await query(
      `UPDATE custom_field_definitions SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
    return rows[0] ? cfdRow(rows[0]) : null;
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const softDelete = async (id) => {
  const { rows } = await query(
    `UPDATE custom_field_definitions SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return rows[0] ? cfdRow(rows[0]) : null;
};

// One statement, entity-scoped (a payload can only touch that entity's own live
// fields) — display_order becomes each id's index in the ordered list.
const reorder = async (entity, orderedIds) => {
  const ids = orderedIds.map(String);
  const idx = orderedIds.map((_, i) => i);
  const { rowCount } = await query(
    `UPDATE custom_field_definitions AS c SET display_order = v.idx, updated_at = now()
       FROM (SELECT * FROM unnest($2::text[], $3::int[]) AS t(id, idx)) v
      WHERE c.id = v.id AND c.entity = $1 AND c.is_deleted = false`,
    [entity, ids, idx]);
  return { modifiedCount: rowCount };
};

module.exports = { list, create, findByIdLean, updateById, softDelete, reorder };
