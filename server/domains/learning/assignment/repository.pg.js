const crypto = require('crypto');
const { query } = require('../../../config/pg');

// ──────────────────────────────────────────────────────────
// learning/assignment/repository — POSTGRES impl. Same interface as
// ./repository.mongo. Required-training assignments (assignments table,
// migration 023) with multi-target populate.
//
// Fidelity notes the parity test pins:
//   • populate('userIds'/'departmentIds') — User & Department have soft-delete
//     find-hooks → a deleted ref DROPS from the array; results are re-ordered to
//     match the stored text[] (Mongoose populate preserves array order, drops
//     missing). populate('programId') (LearningProgram: no soft-delete) and
//     populate('pathId') (LearningPath: no find-hook) embed REGARDLESS of
//     archived/deleted — mirrors Mongo populate exactly.
//   • findProgram/findPath status {$ne:'archived'} → `status IS DISTINCT FROM
//     'archived'` (Mongo $ne also matches null/missing status).
//   • findAssignableUsers name sort = Mongo {name:1} binary order (JS cmp, NOT
//     PG collation).
//   • archive flips status='archived' + is_deleted + deleted_at, returns the
//     populated archived doc.
//   • Enrollment has NO soft-delete (lifecycle = status) → participating read
//     adds no is_deleted predicate on enrollments.
// ──────────────────────────────────────────────────────────

const PARTICIPATING_STATUSES = ['Active', 'On-hold', 'Completed'];
const ASSIGNABLE_USER_STATUSES = ['Active', 'On-hold', 'Waiting for class'];

const newId = () => crypto.randomBytes(12).toString('hex');
// Mongo binary (byte) sort order — NOT PG locale collation (see path repo).
const cmp = (x, y) => ((x || '') < (y || '') ? -1 : (x || '') > (y || '') ? 1 : 0);
// Callers may pass raw ids OR POPULATED summary objects: status-resolver hands
// findAssignableUsers `assignment.userIds`/`departmentIds`, which `list` returns
// populated ({_id,…}). Mongoose casts such objects to their _id inside $in; mirror
// that leniency so `.map(String)` doesn't yield "[object Object]" and match nothing.
const toId = (v) => String(v && typeof v === 'object' && v._id != null ? v._id : v);

// ── populate summaries (lean shapes the DTO + status-resolver consume) ──
const programSummary = (r) => ({ _id: r.id, code: r.code, name: r.name, category: r.category, status: r.status });
const pathSummary = (r) => ({
  _id: r.id, code: r.code, title: r.title, status: r.status, programs: (r.programs || []).map(String),
});
const userSummary = (r) => ({
  _id: r.id, empCode: r.emp_code, name: r.name,
  email: r.email == null ? undefined : r.email,
  department: r.department == null ? undefined : r.department,
  departmentId: r.department_id == null ? undefined : r.department_id,
  status: r.status,
});
const deptSummary = (r) => ({ _id: r.id, code: r.code, name: r.name });

// ── populate embeds (ordered, drop-missing — Mongoose populate semantics) ──
const embedProgram = async (programId) => {
  if (!programId) return null;
  // LearningProgram has no soft-delete hook → populate returns it regardless of status.
  const { rows } = await query(
    `SELECT id, code, name, category, status FROM learning_programs WHERE id = $1`, [String(programId)]);
  return rows[0] ? programSummary(rows[0]) : null;
};

const embedPath = async (pathId) => {
  if (!pathId) return null;
  // LearningPath has NO find-hook → a deleted path still populates (mirrors Mongo).
  const { rows } = await query(
    `SELECT id, code, title, status, programs FROM learning_paths WHERE id = $1`, [String(pathId)]);
  return rows[0] ? pathSummary(rows[0]) : null;
};

const embedUsers = async (userIds) => {
  const ids = (userIds || []).map(String);
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, emp_code, name, email, department, department_id, status
       FROM users WHERE id = ANY($1) AND is_deleted = false`, [ids]);
  const map = new Map(rows.map((r) => [r.id, userSummary(r)]));
  return ids.map((id) => map.get(id)).filter(Boolean); // preserve order, drop deleted/missing
};

const embedDepartments = async (departmentIds) => {
  const ids = (departmentIds || []).map(String);
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, code, name FROM departments WHERE id = ANY($1) AND is_deleted = false`, [ids]);
  const map = new Map(rows.map((r) => [r.id, deptSummary(r)]));
  return ids.map((id) => map.get(id)).filter(Boolean); // preserve order, drop deleted/missing
};

const assignmentRow = (a, { program, path, users, departments }) => (a == null ? null : {
  _id: a.id,
  title: a.title,
  description: a.description == null ? '' : a.description,
  targetType: a.target_type,
  programId: program,
  pathId: path,
  dueDate: a.due_date,
  userIds: users,
  departmentIds: departments,
  status: a.status,
  createdBy: a.created_by || null,
  sourceCertificateId: a.source_certificate_id || null,
  isDeleted: a.is_deleted,
  deletedAt: a.deleted_at || null,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

const embedAll = async (a) => {
  if (!a) return null;
  const [program, path, users, departments] = await Promise.all([
    embedProgram(a.program_id),
    embedPath(a.path_id),
    embedUsers(a.user_ids),
    embedDepartments(a.department_ids),
  ]);
  return assignmentRow(a, { program, path, users, departments });
};

// ── CRUD ──────────────────────────────────────────────────
const findById = async (id) => {
  const { rows } = await query(`SELECT * FROM assignments WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return embedAll(rows[0] || null);
};

const create = async (data) => {
  // Mirror the model's ensureSingleTarget pre-validate: a program target nulls
  // path_id (and vice-versa) so the CHECK constraint holds.
  const targetType = data.targetType;
  const programId = targetType === 'program' ? (data.programId == null ? null : String(data.programId)) : null;
  const pathId = targetType === 'path' ? (data.pathId == null ? null : String(data.pathId)) : null;
  const { rows } = await query(
    `INSERT INTO assignments(id, title, description, target_type, program_id, path_id, due_date,
       user_ids, department_ids, status, created_by, source_certificate_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      newId(), String(data.title), data.description == null ? '' : String(data.description),
      targetType, programId, pathId,
      data.dueDate == null ? null : new Date(data.dueDate).toISOString(),
      (data.userIds || []).map(String), (data.departmentIds || []).map(String),
      data.status == null ? 'active' : data.status,
      data.createdBy == null ? null : String(data.createdBy),
      data.sourceCertificateId == null ? null : String(data.sourceCertificateId),
    ]);
  return findById(rows[0].id); // matches Mongo create → findById (populated)
};

const list = async ({ status = 'active', targetType } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (status) { args.push(status); conds.push(`status = $${args.length}`); }
  if (targetType) { args.push(targetType); conds.push(`target_type = $${args.length}`); }
  const { rows } = await query(
    `SELECT * FROM assignments WHERE ${conds.join(' AND ')} ORDER BY due_date ASC, created_at DESC`, args);
  return Promise.all(rows.map(embedAll));
};

const archive = async (id) => {
  const { rows } = await query(
    `UPDATE assignments SET status = 'archived', is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return embedAll(rows[0] || null);
};

// ── Target existence / counts ─────────────────────────────
const findProgram = async (id) => {
  // LearningProgram has no soft-delete; lifecycle = status. $ne 'archived' also
  // accepts null status → IS DISTINCT FROM.
  const { rows } = await query(
    `SELECT id FROM learning_programs WHERE id = $1 AND status IS DISTINCT FROM 'archived'`, [String(id)]);
  return rows[0] ? { _id: rows[0].id } : null;
};

const findPath = async (id) => {
  const { rows } = await query(
    `SELECT id, programs FROM learning_paths
      WHERE id = $1 AND is_deleted = false AND status IS DISTINCT FROM 'archived'`, [String(id)]);
  return rows[0] ? { _id: rows[0].id, programs: (rows[0].programs || []).map(String) } : null;
};

const countDepartments = async (ids) => {
  if (!ids || !ids.length) return 0;
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM departments WHERE id = ANY($1) AND is_deleted = false`, [ids.map(String)]);
  return rows[0].n;
};

const countUsers = async (ids) => {
  if (!ids || !ids.length) return 0;
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM users WHERE id = ANY($1) AND is_deleted = false`, [ids.map(String)]);
  return rows[0].n;
};

const findAssignableUsers = async ({ userIds = [], departmentIds = [] } = {}) => {
  if (!userIds.length && !departmentIds.length) return [];
  // Empty arrays are no-ops in `= ANY('{}')` → mirrors Mongo's conditional $or.
  const { rows } = await query(
    `SELECT id, emp_code, name, email, department, department_id, status
       FROM users
      WHERE (id = ANY($1) OR department_id = ANY($2))
        AND is_deleted = false
        AND status = ANY($3)`,
    [userIds.map(toId), departmentIds.map(toId), ASSIGNABLE_USER_STATUSES]);
  rows.sort((a, b) => cmp(a.name, b.name)); // Mongo {name:1} binary order
  return rows.map(userSummary);
};

// ── Learner self view (Cohesion P3) ───────────────────────
const findActiveAssignmentsForUser = async (userId, departmentId) => {
  const args = [String(userId)];
  const or = ['$1 = ANY(user_ids)'];
  if (departmentId) { args.push(String(departmentId)); or.push(`$${args.length} = ANY(department_ids)`); }
  const { rows } = await query(
    `SELECT * FROM assignments
      WHERE is_deleted = false AND status = 'active' AND (${or.join(' OR ')})
      ORDER BY due_date ASC`, args);
  return Promise.all(rows.map(embedAll));
};

const findOpenSelfEnrollCohort = async (programId) => {
  if (!programId) return null;
  const prog = await query(`SELECT scheduling_mode FROM learning_programs WHERE id = $1`, [String(programId)]);
  if (!prog.rows[0] || prog.rows[0].scheduling_mode !== 'self_enroll') return null;
  const { rows } = await query(
    `SELECT id, class_code FROM classes
      WHERE program_id = $1 AND status = 'Ongoing' AND is_deleted = false
      ORDER BY created_at ASC LIMIT 1`, [String(programId)]);
  return rows[0] ? { _id: rows[0].id, classCode: rows[0].class_code } : null;
};

const findParticipatingUserIdsForProgram = async (userIds, programId) => {
  if (!userIds || !userIds.length) return new Set();
  // classIds resolved inline via subquery (Class soft-delete filter); Enrollment
  // has no soft-delete. DISTINCT user_id = Mongo .distinct('userId').
  const { rows } = await query(
    `SELECT DISTINCT e.user_id FROM enrollments e
      WHERE e.user_id = ANY($1)
        AND e.status = ANY($2)
        AND e.class_id IN (SELECT id FROM classes WHERE program_id = $3 AND is_deleted = false)`,
    [userIds.map(String), PARTICIPATING_STATUSES, String(programId)]);
  return new Set(rows.map((r) => String(r.user_id)));
};

module.exports = {
  PARTICIPATING_STATUSES,
  ASSIGNABLE_USER_STATUSES,
  create,
  findById,
  list,
  archive,
  findProgram,
  findPath,
  countDepartments,
  countUsers,
  findAssignableUsers,
  findActiveAssignmentsForUser,
  findOpenSelfEnrollCohort,
  findParticipatingUserIdsForProgram,
};
