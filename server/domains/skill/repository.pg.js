const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// skill/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Skill CRUD over the skills table (migration 006) + the certificate-derived
// completion-signal reads (Map/Set shapes) + supporting user/program reads.
//
// Fidelity to the Mongoose model the parity test pins:
//   • Skill has NO pre('find') hook and isDeleted is NOT select:false → soft-delete
//     is an EXPLICIT predicate and isDeleted/deletedAt ARE part of the returned shape.
//   • create defaults: category 'General', hue 250, programIds [], maxLevel 5,
//     targetByRole {}, coverageTarget null, parentId null.
//   • findByName = case-insensitive exact match among live (lower(name)=lower($1)).
//   • LearningProgram has no soft-delete hook → programNamesByIds does not filter;
//     activeProgramNamesByIds filters status='active'.
//   • User has a soft-delete hook → the user reads filter is_deleted=false.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // code-point order (matches Mongo binary sort)

const skillRow = (r) => (r == null ? null : {
  _id: r.id,
  name: r.name,
  category: r.category,
  parentId: r.parent_id || null,
  hue: r.hue == null ? null : Number(r.hue),
  programIds: (r.program_ids || []).map(String),
  maxLevel: Number(r.max_level),
  targetByRole: r.target_by_role || {},
  coverageTarget: r.coverage_target == null ? null : Number(r.coverage_target),
  isDeleted: r.is_deleted,
  deletedAt: r.deleted_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ── Skill CRUD ────────────────────────────────────────────
const listLive = async () => {
  const { rows } = await query(`SELECT * FROM skills WHERE is_deleted = false`);
  return rows.map(skillRow).sort((a, b) => cmp(a.category, b.category) || cmp(a.name, b.name));
};

const findById = async (id) => {
  const { rows } = await query(`SELECT * FROM skills WHERE id = $1 AND is_deleted = false`, [id]);
  return rows[0] ? skillRow(rows[0]) : null;
};

const findByName = async (name, excludeId = null) => {
  const args = [name];
  let sql = `SELECT * FROM skills WHERE is_deleted = false AND lower(name) = lower($1)`;
  if (excludeId) { args.push(excludeId); sql += ` AND id <> $${args.length}`; }
  sql += ' LIMIT 1';
  const { rows } = await query(sql, args);
  return rows[0] ? skillRow(rows[0]) : null;
};

const SKILL_COL = {
  name: 'name', category: 'category', parentId: 'parent_id', hue: 'hue', programIds: 'program_ids',
  maxLevel: 'max_level', targetByRole: 'target_by_role', coverageTarget: 'coverage_target',
  isDeleted: 'is_deleted', deletedAt: 'deleted_at',
};
const skillVal = (k, v) => {
  if (k === 'name' || k === 'category') return v == null ? v : String(v).trim();
  if (k === 'programIds') return (v || []).map(String);
  if (k === 'targetByRole') return JSON.stringify(v == null ? {} : v);
  if (k === 'parentId') return v == null ? null : String(v);
  return v;
};

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO skills(id,name,category,parent_id,hue,program_ids,max_level,target_by_role,coverage_target)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      newId(),
      String(data.name).trim(),
      data.category == null ? 'General' : String(data.category).trim(),
      data.parentId == null ? null : String(data.parentId),
      data.hue == null ? 250 : data.hue,
      (data.programIds || []).map(String),
      data.maxLevel == null ? 5 : data.maxLevel,
      JSON.stringify(data.targetByRole == null ? {} : data.targetByRole),
      data.coverageTarget == null ? null : data.coverageTarget,
    ],
  );
  return skillRow(rows[0]);
};

const updateById = async (id, patch) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(SKILL_COL)) {
    if (hasOwn(patch, k)) { args.push(skillVal(k, patch[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(
    `UPDATE skills SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? skillRow(rows[0]) : null;
};

const softDeleteById = (id) => updateById(id, { isDeleted: true, deletedAt: new Date() });

// ── Completion signal ─────────────────────────────────────
const completedProgramIdsForUser = async (userId) => {
  const { rows } = await query(
    `SELECT DISTINCT program_id FROM certificates
      WHERE user_id = $1 AND status = 'Issued' AND is_deleted = false AND program_id IS NOT NULL`, [userId]);
  return new Set(rows.map((r) => String(r.program_id)));
};

const completedProgramIdsByUser = async () => {
  const { rows } = await query(
    `SELECT user_id, array_agg(DISTINCT program_id) AS programs FROM certificates
      WHERE status = 'Issued' AND is_deleted = false AND program_id IS NOT NULL GROUP BY user_id`);
  const map = new Map();
  for (const r of rows) map.set(String(r.user_id), new Set((r.programs || []).map(String)));
  return map;
};

const holdersByProgram = async () => {
  const { rows } = await query(
    `SELECT program_id, array_agg(DISTINCT user_id) AS users FROM certificates
      WHERE status = 'Issued' AND is_deleted = false AND program_id IS NOT NULL GROUP BY program_id`);
  const map = new Map();
  for (const r of rows) map.set(String(r.program_id), new Set((r.users || []).map(String)));
  return map;
};

// ── Supporting reads ──────────────────────────────────────
const listUsersWithRole = async () => {
  const { rows } = await query(`SELECT id, role FROM users WHERE is_deleted = false`);
  return rows.map((r) => ({ _id: r.id, role: r.role }));
};

const findUserBasic = async (id) => {
  const { rows } = await query(
    `SELECT id, name, role, department, emp_code FROM users WHERE id = $1 AND is_deleted = false`, [id]);
  return rows[0] ? { _id: rows[0].id, name: rows[0].name, role: rows[0].role, department: rows[0].department, empCode: rows[0].emp_code } : null;
};

const programNamesByIds = async (ids) => {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await query(`SELECT id, name FROM learning_programs WHERE id = ANY($1)`, [ids.map(String)]);
  return new Map(rows.map((r) => [String(r.id), r.name]));
};

const activeProgramNamesByIds = async (ids) => {
  if (!ids || ids.length === 0) return new Map();
  const { rows } = await query(
    `SELECT id, name FROM learning_programs WHERE id = ANY($1) AND status = 'active'`, [ids.map(String)]);
  return new Map(rows.map((r) => [String(r.id), r.name]));
};

module.exports = {
  listLive,
  findById,
  findByName,
  create,
  updateById,
  softDeleteById,
  completedProgramIdsForUser,
  completedProgramIdsByUser,
  holdersByProgram,
  listUsersWithRole,
  findUserBasic,
  programNamesByIds,
  activeProgramNamesByIds,
};
