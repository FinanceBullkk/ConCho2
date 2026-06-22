const crypto = require('crypto');
const { query } = require('../../config/pg');

// access/repository — POSTGRES impl. Same interface as ./repository.mongo. Role
// CRUD over the roles table (migration 014). Soft-delete is an explicit predicate;
// key is partial-unique among live rows.

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const roleRow = (r) => (r == null ? null : {
  _id: r.id, key: r.key, name: r.name, system: r.system,
  capabilities: (r.capabilities || []).map(String), isDeleted: r.is_deleted,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const listLive = async () => {
  const { rows } = await query(`SELECT * FROM roles WHERE is_deleted = false ORDER BY system DESC, key ASC`);
  return rows.map(roleRow);
};

const findByKey = async (key) => {
  const { rows } = await query(`SELECT * FROM roles WHERE key = $1 AND is_deleted = false LIMIT 1`, [key]);
  return rows[0] ? roleRow(rows[0]) : null;
};

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO roles(id,key,name,system,capabilities) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [newId(), data.key, data.name, data.system == null ? false : data.system, (data.capabilities || []).map(String)]);
  return roleRow(rows[0]);
};

const ROLE_COL = { key: 'key', name: 'name', system: 'system', capabilities: 'capabilities', isDeleted: 'is_deleted', deletedAt: 'deleted_at' };
const roleVal = (k, v) => (k === 'capabilities' ? (v || []).map(String) : v);

const updateByKey = async (key, patch) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(ROLE_COL)) {
    if (hasOwn(patch, k)) { args.push(roleVal(k, patch[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(key);
  const { rows } = await query(
    `UPDATE roles SET ${sets.join(', ')} WHERE key = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? roleRow(rows[0]) : null;
};

const softDeleteByKey = async (key) => {
  const { rows } = await query(
    `UPDATE roles SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE key = $1 AND is_deleted = false RETURNING *`,
    [key]);
  return rows[0] ? roleRow(rows[0]) : null;
};

module.exports = { listLive, findByKey, create, updateByKey, softDeleteByKey };
