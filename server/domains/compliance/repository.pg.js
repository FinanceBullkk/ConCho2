const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// compliance/repository — POSTGRES impl. Same interface as ./repository.mongo.
// RequiredTraining CRUD + the matrix's read-only signals (workforce, issued
// certificates, program/path labels).
//
// Fidelity notes the parity test pins:
//   • appliesTo.{type,value} ↔ applies_to_* cols, target.{kind,id} ↔ target_*
//     cols; an update with appliesTo/target REPLACES that pair.
//   • RequiredTraining + User + Certificate filter is_deleted=false (those models
//     hook find); LearningPath has NO find-hook → findPathsByIds does NOT filter
//     deleted (mirrors Mongo); LearningProgram has no soft-delete at all.
//   • listWorkforce/findUserById select office_id (added in migration 018).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// isDeleted/deletedAt are select:false on RequiredTraining → lean omits them.
const reqRow = (r) => (r == null ? null : {
  _id: r.id,
  appliesTo: { type: r.applies_to_type, value: r.applies_to_value || '' },
  target: { kind: r.target_kind, id: r.target_id || null },
  dueWithinDays: r.due_within_days == null ? null : Number(r.due_within_days),
  recurrence: r.recurrence, mandatory: r.mandatory, label: r.label || '',
  createdBy: r.created_by || null, createdAt: r.created_at, updatedAt: r.updated_at,
});

const userRow = (r) => (r == null ? null : {
  _id: r.id, empCode: r.emp_code, name: r.name, role: r.role,
  department: r.department || null, departmentId: r.department_id || null,
  officeId: r.office_id || null, createdAt: r.created_at,
});

// ── RequiredTraining CRUD ────────────────────────────────────
const createRequirement = async (data) => {
  const a = data.appliesTo || {};
  const t = data.target || {};
  const { rows } = await query(
    `INSERT INTO required_training(id, applies_to_type, applies_to_value, target_kind, target_id,
       due_within_days, recurrence, mandatory, label, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      newId(), a.type, a.value == null ? '' : a.value, t.kind == null ? 'program' : t.kind,
      t.id == null ? null : String(t.id), data.dueWithinDays == null ? 90 : data.dueWithinDays,
      data.recurrence == null ? 'once' : data.recurrence, data.mandatory == null ? true : data.mandatory,
      data.label == null ? '' : data.label, data.createdBy == null ? null : String(data.createdBy),
    ]);
  return reqRow(rows[0]);
};

const listRequirements = async () => {
  const { rows } = await query(`SELECT * FROM required_training WHERE is_deleted = false ORDER BY created_at DESC`);
  return rows.map(reqRow);
};

const findRequirementById = async (id) => {
  const { rows } = await query(`SELECT * FROM required_training WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? reqRow(rows[0]) : null;
};

const updateRequirement = async (id, data) => {
  const sets = [];
  const args = [];
  const push = (col, val) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  if (hasOwn(data, 'appliesTo')) {
    const a = data.appliesTo || {};
    push('applies_to_type', a.type);
    push('applies_to_value', a.value == null ? '' : a.value);
  }
  if (hasOwn(data, 'target')) {
    const t = data.target || {};
    push('target_kind', t.kind == null ? 'program' : t.kind);
    push('target_id', t.id == null ? null : String(t.id));
  }
  if (hasOwn(data, 'dueWithinDays')) push('due_within_days', data.dueWithinDays);
  if (hasOwn(data, 'recurrence')) push('recurrence', data.recurrence);
  if (hasOwn(data, 'mandatory')) push('mandatory', data.mandatory);
  if (hasOwn(data, 'label')) push('label', data.label);
  if (!sets.length) return findRequirementById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE required_training SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? reqRow(rows[0]) : null;
};

const softDeleteRequirement = async (id) => {
  const { rows } = await query(
    `UPDATE required_training SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return rows[0] ? reqRow(rows[0]) : null;
};

// ── Workforce + completion signals ───────────────────────────
const USER_COLS = 'id, emp_code, name, role, department, department_id, office_id, created_at';

const listWorkforce = async ({ departmentId, role } = {}) => {
  const conds = ["status = 'Active'", 'is_deleted = false'];
  const args = [];
  if (role) { args.push(role); conds.push(`role = $${args.length}`); }
  if (departmentId) { args.push(String(departmentId)); conds.push(`department_id = $${args.length}`); }
  const { rows } = await query(`SELECT ${USER_COLS} FROM users WHERE ${conds.join(' AND ')}`, args);
  return rows.map(userRow);
};

const findUserById = async (id) => {
  const { rows } = await query(`SELECT ${USER_COLS} FROM users WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? userRow(rows[0]) : null;
};

const listIssuedCertificates = async ({ userIds, programIds }) => {
  if (!userIds.length || !programIds.length) return [];
  const { rows } = await query(
    `SELECT id, user_id, program_id, issued_at FROM certificates
      WHERE user_id = ANY($1) AND program_id = ANY($2) AND status = 'Issued' AND is_deleted = false`,
    [userIds.map(String), programIds.map(String)]);
  return rows.map((r) => ({ _id: r.id, userId: r.user_id, programId: r.program_id, issuedAt: r.issued_at }));
};

// ── Label lookups ────────────────────────────────────────────
const findProgramsByIds = async (ids) => {
  if (!ids.length) return [];
  // LearningProgram has no soft-delete (lifecycle = status).
  const { rows } = await query(`SELECT id, name, code FROM learning_programs WHERE id = ANY($1)`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name, code: r.code }));
};

const findPathsByIds = async (ids) => {
  if (!ids.length) return [];
  // LearningPath has NO find-hook → deleted paths are NOT filtered (mirrors Mongo).
  const { rows } = await query(`SELECT id, title, code, programs FROM learning_paths WHERE id = ANY($1)`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, title: r.title, code: r.code, programs: (r.programs || []).map(String) }));
};

module.exports = {
  createRequirement,
  listRequirements,
  findRequirementById,
  updateRequirement,
  softDeleteRequirement,
  listWorkforce,
  findUserById,
  listIssuedCertificates,
  findProgramsByIds,
  findPathsByIds,
};
