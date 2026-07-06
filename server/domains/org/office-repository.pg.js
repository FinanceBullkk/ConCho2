const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// org/office-repository — POSTGRES impl. Same interface as ./office-repository.mongo.
// Office CRUD + a count of live users still pointing at an office.
//
// Fidelity notes the parity test pins:
//   • soft-delete is explicit (is_deleted=false) on every read/update; isDeleted/
//     deletedAt are select:false on the model → the row mapper omits them.
//   • listOffices search = case-insensitive substring on name/code (Mongo escaped
//     regex) → ILIKE with %/_ escaped; sort name asc.
//   • the unique-code violation (23505) maps to a Mongo-style { code: 11000 } so
//     office-use-cases#asConflict surfaces the same 409.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const officeRow = (r) => (r == null ? null : {
  _id: r.id, name: r.name, code: r.code, address: r.address || '', timezone: r.timezone || '',
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const duplicateError = () => {
  const e = new Error('An office with this code already exists');
  e.code = 11000;
  return e;
};

const createOffice = async (data) => {
  try {
    const { rows } = await query(
      `INSERT INTO offices(id,name,code,address,timezone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newId(), officeVal('name', data.name), officeVal('code', data.code),
        data.address == null ? '' : officeVal('address', data.address),
        data.timezone == null ? '' : officeVal('timezone', data.timezone)]);
    return officeRow(rows[0]);
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const findOfficeByIdLean = async (id) => {
  const { rows } = await query(`SELECT * FROM offices WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? officeRow(rows[0]) : null;
};

const listOffices = async ({ search } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (search) {
    // Mongo escapes regex specials (literal match); ILIKE treats %/_ as wildcards,
    // so escape those (and the escape char) to keep the substring match literal.
    const esc = String(search).replace(/[%_\\]/g, '\\$&');
    args.push(`%${esc}%`);
    conds.push(`(name ILIKE $${args.length} OR code ILIKE $${args.length})`);
  }
  const { rows } = await query(`SELECT * FROM offices WHERE ${conds.join(' AND ')} ORDER BY name ASC`, args);
  return rows.map(officeRow);
};

const OFFICE_COL = { name: 'name', code: 'code', address: 'address', timezone: 'timezone', isDeleted: 'is_deleted', deletedAt: 'deleted_at' };
// Replicate the Mongoose Office schema setters (name/address/timezone trim,
// code trim+UPPERCASE) so create/update normalize identically on both backends.
const officeVal = (k, v) => {
  if (k === 'deletedAt') return v ? new Date(v).toISOString() : v;
  if (k === 'code') return v == null ? v : String(v).trim().toUpperCase();
  if (k === 'name' || k === 'address' || k === 'timezone') return v == null ? v : String(v).trim();
  return v;
};

const updateOfficeById = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(OFFICE_COL)) {
    if (hasOwn(data, k)) { args.push(officeVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findOfficeByIdLean(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  try {
    const { rows } = await query(
      `UPDATE offices SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
    return rows[0] ? officeRow(rows[0]) : null;
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
};

const softDeleteOffice = (id) => updateOfficeById(id, { isDeleted: true, deletedAt: new Date() });

const countUsersInOffice = async (officeId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM users WHERE office_id = $1 AND is_deleted = false`, [String(officeId)]);
  return rows[0].n;
};

module.exports = {
  createOffice,
  findOfficeByIdLean,
  listOffices,
  updateOfficeById,
  softDeleteOffice,
  countUsersInOffice,
};
