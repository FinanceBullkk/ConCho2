const crypto = require('crypto');
const { query } = require('../../../config/pg');

// learning/path/repository — POSTGRES impl. Same interface as ./repository.mongo.
// learning_paths table (migration 012). populate('programs', summary) is an
// ORDERED array-embed — fetch the referenced programs and re-order to match the
// path's `programs` text[] (Mongoose populate preserves array order, drops missing).

const newId = () => crypto.randomBytes(12).toString('hex');
const cmp = (x, y) => ((x || '') < (y || '') ? -1 : (x || '') > (y || '') ? 1 : 0);

const programSummary = (r) => ({ _id: r.id, code: r.code, name: r.name, category: r.category, status: r.status, schedulingMode: r.scheduling_mode });

// ORDERED embed of the path's programs (summary fields).
const embedPrograms = async (programIds) => {
  const ids = (programIds || []).map(String);
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, code, name, category, status, scheduling_mode FROM learning_programs WHERE id = ANY($1)`, [ids]);
  const map = new Map(rows.map((r) => [r.id, programSummary(r)]));
  return ids.map((id) => map.get(id)).filter(Boolean); // preserve order, drop missing (populate semantics)
};

// `populated` = true → programs is the embedded summary array (lean reads);
// false → raw id strings (findById, the audit before-snapshot / existence doc).
const pathRow = (p, programs) => (p == null ? null : {
  _id: p.id, code: p.code, title: p.title, description: p.description || '',
  programs: programs !== undefined ? programs : (p.programs || []).map(String),
  status: p.status, isDeleted: p.is_deleted,
  createdAt: p.created_at, updatedAt: p.updated_at,
});

const selectOne = async (id) => {
  const { rows } = await query(`SELECT * FROM learning_paths WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] || null;
};

const findByIdLean = async (id) => {
  const p = await selectOne(id);
  return p ? pathRow(p, await embedPrograms(p.programs)) : null;
};

const findById = async (id) => {
  const p = await selectOne(id);
  return p ? pathRow(p) : null; // raw program ids (un-populated doc analogue)
};

const PATH_COL = { code: 'code', title: 'title', description: 'description', programs: 'programs', status: 'status', isDeleted: 'is_deleted', deletedAt: 'deleted_at' };
const pathVal = (k, v) => {
  if (k === 'code') return v == null ? v : String(v).trim().toUpperCase();
  if (k === 'title' || k === 'description') return v == null ? v : String(v).trim();
  if (k === 'programs') return (v || []).map(String);
  return v;
};

const create = async (data) => {
  try {
    return await createInner(data);
  } catch (error) {
    // Re-map the PG unique violation to Mongo's E11000 so the use-case's
    // duplicate-code → 409 mapping fires on either backend.
    if (error && error.code === '23505') { const e = new Error('duplicate path code'); e.code = 11000; throw e; }
    throw error;
  }
};

const createInner = async (data) => {
  const { rows } = await query(
    `INSERT INTO learning_paths(id,code,title,description,programs,status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      newId(), String(data.code).trim().toUpperCase(), String(data.title).trim(),
      data.description == null ? '' : String(data.description).trim(),
      (data.programs || []).map(String), data.status == null ? 'active' : data.status,
    ]);
  return findByIdLean(rows[0].id); // matches Mongo create → findByIdLean
};

const updateById = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(PATH_COL)) {
    if (Object.prototype.hasOwnProperty.call(data, k)) { args.push(pathVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE learning_paths SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? pathRow(rows[0], await embedPrograms(rows[0].programs)) : null;
};

const softDelete = (id) => updateById(id, { isDeleted: true, deletedAt: new Date(), status: 'archived' });

const list = async ({ status, search }) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (status) { args.push(status); conds.push(`status = $${args.length}`); }
  if (search) {
    args.push(`%${search.replace(/([%_\\])/g, '\\$1')}%`);
    conds.push(`(code ILIKE $${args.length} OR title ILIKE $${args.length})`);
  }
  const { rows } = await query(`SELECT * FROM learning_paths WHERE ${conds.join(' AND ')}`, args);
  rows.sort((a, b) => cmp(a.title, b.title)); // {title:1} (Mongo binary order)
  return Promise.all(rows.map(async (p) => pathRow(p, await embedPrograms(p.programs))));
};

module.exports = { create, findById, findByIdLean, list, updateById, softDelete };
