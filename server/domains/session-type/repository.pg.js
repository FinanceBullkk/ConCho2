const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// session-type/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Metadata catalog over session_types (migration 005). Soft-delete is an explicit
// predicate; isDeleted/deletedAt are select:false → omitted from returned shapes.
// `order` maps to the `display_order` column (`order` is a SQL reserved word).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const typeRow = (r) => (r == null ? null : {
  _id: r.id,
  name: r.name,
  color: r.color,
  defaultDurationMin: r.default_duration_min == null ? null : Number(r.default_duration_min),
  defaultCapacity: r.default_capacity == null ? null : Number(r.default_capacity),
  order: Number(r.display_order),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO session_types(id,name,color,default_duration_min,default_capacity,display_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      newId(),
      String(data.name).trim(),
      data.color == null ? '#6366f1' : String(data.color).trim(),
      data.defaultDurationMin == null ? 60 : data.defaultDurationMin,
      data.defaultCapacity == null ? null : data.defaultCapacity,
      data.order == null ? 0 : data.order,
    ],
  );
  return typeRow(rows[0]);
};

const list = async () => {
  const { rows } = await query(
    `SELECT * FROM session_types WHERE is_deleted = false ORDER BY display_order ASC, created_at ASC`);
  return rows.map(typeRow);
};

const findByIdLean = async (id) => {
  const { rows } = await query(`SELECT * FROM session_types WHERE id = $1 AND is_deleted = false`, [id]);
  return rows[0] ? typeRow(rows[0]) : null;
};

const FIELD_COL = {
  name: 'name', color: 'color', defaultDurationMin: 'default_duration_min',
  defaultCapacity: 'default_capacity', order: 'display_order', isDeleted: 'is_deleted', deletedAt: 'deleted_at',
};
const norm = (k, v) => ((k === 'name' || k === 'color') && v != null ? String(v).trim() : v);

const updateById = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(FIELD_COL)) {
    if (hasOwn(data, k)) { args.push(norm(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(
    `UPDATE session_types SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? typeRow(rows[0]) : null;
};

const softDelete = (id) => updateById(id, { isDeleted: true, deletedAt: new Date() });

const maxOrder = async () => {
  const { rows } = await query(
    `SELECT display_order FROM session_types WHERE is_deleted = false ORDER BY display_order DESC LIMIT 1`);
  return rows[0] ? (rows[0].display_order || 0) : 0;
};

module.exports = { create, list, findByIdLean, updateById, softDelete, maxOrder };
