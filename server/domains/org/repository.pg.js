const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// org/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Departments CRUD + manager hierarchy / dashboard rollups over the
// departments table + the org user columns (migration 004).
//
// Fidelity to the Mongoose models the parity test pins:
//   • setters: department code trimmed + UPPERCASE, name/description trimmed.
//   • soft-delete: explicit `is_deleted = false` predicates; isDeleted/deletedAt
//     are select:false → omitted from returned shapes.
//   • listDirectReports populate('departmentId') → LEFT JOIN departments …
//     is_deleted=false (a soft-deleted dept surfaces as departmentId:null, the
//     DTO then falls back to the legacy `department` string).
// ──────────────────────────────────────────────────────────

const PARTICIPATING_STATUSES = ['Active', 'On-hold', 'Completed'];

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const escapeLike = (s) => s.replace(/([%_\\])/g, '\\$1');

// Department lean shape (departmentDto reads these; isDeleted/deletedAt omitted).
const deptRow = (r) => (r == null ? null : {
  _id: r.id, name: r.name, code: r.code, description: r.description || '',
  createdAt: r.created_at, updatedAt: r.updated_at,
});

// User shape for the org reads/writes (the fields the dto + use-case consume).
const userRow = (r) => (r == null ? null : {
  _id: r.id, name: r.name, empCode: r.emp_code, email: r.email || null, role: r.role,
  status: r.status, position: r.position || '', department: r.department,
  departmentId: r.department_id || null, managerId: r.manager_id || null,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

// ── Departments ───────────────────────────────────────────
const createDepartment = async (data) => {
  const { rows } = await query(
    `INSERT INTO departments(id,name,code,description) VALUES ($1,$2,$3,$4) RETURNING *`,
    [newId(), String(data.name).trim(), String(data.code).trim().toUpperCase(),
      data.description == null ? '' : String(data.description).trim()],
  );
  return deptRow(rows[0]);
};

const findDepartmentByIdLean = async (id) => {
  const { rows } = await query(`SELECT * FROM departments WHERE id = $1 AND is_deleted = false`, [id]);
  return rows[0] ? deptRow(rows[0]) : null;
};
const findDepartmentById = findDepartmentByIdLean; // same shape for PG (no Mongoose doc)

const listDepartments = async ({ search } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (search) {
    args.push(`%${escapeLike(search)}%`);
    conds.push(`(name ILIKE $${args.length} OR code ILIKE $${args.length})`);
  }
  const { rows } = await query(`SELECT * FROM departments WHERE ${conds.join(' AND ')} ORDER BY name ASC`, args);
  return rows.map(deptRow);
};

const DEPT_COL = { name: 'name', code: 'code', description: 'description', isDeleted: 'is_deleted', deletedAt: 'deleted_at' };
const deptNorm = (k, v) => (k === 'code' ? String(v).trim().toUpperCase()
  : (k === 'name' || k === 'description') && v != null ? String(v).trim() : v);

const updateDepartmentById = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(DEPT_COL)) {
    if (hasOwn(data, k)) { args.push(deptNorm(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(
    `UPDATE departments SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? deptRow(rows[0]) : null;
};

const softDeleteDepartment = (id) => updateDepartmentById(id, { isDeleted: true, deletedAt: new Date() });

const countUsersInDepartment = async (departmentId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM users WHERE department_id = $1 AND is_deleted = false`, [departmentId]);
  return rows[0].n;
};

// ── Manager hierarchy / assignment ────────────────────────
const findUserByIdLean = async (id) => {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1 AND is_deleted = false`, [id]);
  return rows[0] ? userRow(rows[0]) : null;
};
const findUserById = findUserByIdLean;

const USER_ASSIGN_COL = { managerId: 'manager_id', departmentId: 'department_id', position: 'position', status: 'status' };

const updateUserAssignment = async (id, patch) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(USER_ASSIGN_COL)) {
    if (hasOwn(patch, k)) { args.push(patch[k]); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findUserByIdLean(id);
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? userRow(rows[0]) : null;
};

const listDirectReports = async (managerId) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.emp_code, u.email, u.role, u.status, u.department, u.position,
            u.department_id, d.name AS dept_name, d.code AS dept_code
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id AND d.is_deleted = false
      WHERE u.manager_id = $1 AND u.is_deleted = false
      ORDER BY u.name ASC`,
    [managerId],
  );
  return rows.map((r) => ({
    _id: r.id, name: r.name, empCode: r.emp_code, email: r.email || null, role: r.role,
    status: r.status, department: r.department, position: r.position || '',
    departmentId: r.dept_name != null ? { _id: r.department_id, name: r.dept_name, code: r.dept_code } : null,
  }));
};

// ── Training rollups ──────────────────────────────────────
const aggregateActiveEnrollments = async (userIds) => {
  if (!userIds || !userIds.length) return [];
  const { rows } = await query(
    `SELECT user_id AS _id, count(*)::int AS count, array_agg(DISTINCT class_id) AS programs
       FROM enrollments WHERE user_id = ANY($1) AND status = ANY($2)
      GROUP BY user_id`,
    [userIds.map(String), PARTICIPATING_STATUSES],
  );
  return rows.map((r) => ({ _id: r._id, count: r.count, programs: r.programs }));
};

const aggregateIssuedCertificates = async (userIds) => {
  if (!userIds || !userIds.length) return [];
  const { rows } = await query(
    `SELECT user_id AS _id, count(*)::int AS count, array_agg(DISTINCT program_id) AS programs
       FROM certificates WHERE user_id = ANY($1) AND status = 'Issued' AND is_deleted = false
      GROUP BY user_id`,
    [userIds.map(String)],
  );
  return rows.map((r) => ({ _id: r._id, count: r.count, programs: r.programs }));
};

module.exports = {
  PARTICIPATING_STATUSES,
  createDepartment,
  findDepartmentById,
  findDepartmentByIdLean,
  listDepartments,
  updateDepartmentById,
  softDeleteDepartment,
  countUsersInDepartment,
  findUserById,
  findUserByIdLean,
  updateUserAssignment,
  listDirectReports,
  aggregateActiveEnrollments,
  aggregateIssuedCertificates,
};
