// user-list-repository — POSTGRES impl (Phase 3 Wave-G: getUsers list read port).
// Same interface as ./user-list-repository.mongo. Reads the migrated users table
// so the admin list surfaces PG-written denormalisations (e.g. last_active_at,
// bumped by the ported attendance write-through) — which a Mongoose read would
// miss on the pg lane.
//
// Fidelity to the Mongoose read the parity test pins:
//   • select:false fields (password, mfa*, failed_login*, lock_until, is_deleted,
//     deleted_at, password_*) are NEVER selected — the Mongoose default projection
//     hides them too.
//   • department + free-text search = case-insensitive CONTAINS (Mongo escaped
//     regex → literal ILIKE with %,_,\ escaped).
//   • soft-delete = explicit is_deleted=false predicate (no find-hook in SQL).
//   • Mongo sorts null/missing as the LOWEST value → nulls first on ASC, last on
//     DESC; the _id tiebreak keeps pagination deterministic.
const { query } = require('../../config/pg');

const SELECT_COLS = `id, emp_code, name, email, role, department, department_id,
  manager_id, office_id, position, status, drop_reason, entrance_level,
  current_level, must_change_password, mfa_enabled, notification_preferences,
  last_active_at, created_at, updated_at`;

// Sortable field (Mongoose name) → column. Mirrors the controller whitelist;
// `lastActive` was already mapped to `lastActiveAt` before it reaches here.
const SORT_COL = {
  empCode: 'emp_code', name: 'name', department: 'department', position: 'position',
  status: 'status', role: 'role', entranceLevel: 'entrance_level',
  currentLevel: 'current_level', lastActiveAt: 'last_active_at',
};

const escapeLike = (s) => s.replace(/([%_\\])/g, '\\$1');

const buildWhere = ({ role, status, department, search } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (role) { args.push(role); conds.push(`role = $${args.length}`); }
  if (status) { args.push(status); conds.push(`status = $${args.length}`); }
  if (department) { args.push(`%${escapeLike(department)}%`); conds.push(`department ILIKE $${args.length}`); }
  if (search) {
    args.push(`%${escapeLike(search)}%`);
    const i = args.length;
    conds.push(`(emp_code ILIKE $${i} OR name ILIKE $${i} OR department ILIKE $${i} OR position ILIKE $${i})`);
  }
  return { where: conds.join(' AND '), args };
};

// Map a users row to the shape getUsers returns (camelCase, select:false omitted).
// customFields has no dedicated column yet → default {} to match the Mongoose default.
const rowToUser = (r) => ({
  _id: r.id,
  empCode: r.emp_code,
  name: r.name,
  email: r.email,
  role: r.role,
  department: r.department,
  departmentId: r.department_id,
  managerId: r.manager_id,
  officeId: r.office_id,
  position: r.position,
  status: r.status,
  dropReason: r.drop_reason,
  entranceLevel: r.entrance_level,
  currentLevel: r.current_level,
  mustChangePassword: r.must_change_password,
  mfaEnabled: r.mfa_enabled,
  notificationPreferences: r.notification_preferences == null ? undefined : r.notification_preferences,
  customFields: {},
  lastActiveAt: r.last_active_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const listUsers = async ({ role, status, department, search, sortField, sortOrder, skip, limit }) => {
  const { where, args } = buildWhere({ role, status, department, search });
  const col = SORT_COL[sortField] || 'emp_code';
  const dir = sortOrder === -1 ? 'DESC' : 'ASC';
  const nulls = dir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST'; // Mongo: null = lowest value
  // Text columns sort in BYTE order (COLLATE "C") to match Mongo's binary order,
  // NOT PG's locale collation (same discipline as the assignment/path repos).
  // last_active_at is a timestamp → not collatable, so no COLLATE.
  const collate = col === 'last_active_at' ? '' : ' COLLATE "C"';
  const params = [...args, limit, skip];
  const { rows } = await query(
    `SELECT ${SELECT_COLS} FROM users WHERE ${where}
      ORDER BY ${col}${collate} ${dir} ${nulls}, id COLLATE "C" ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(rowToUser);
};

const countUsers = async ({ role, status, department, search } = {}) => {
  const { where, args } = buildWhere({ role, status, department, search });
  const { rows } = await query(`SELECT count(*)::int AS n FROM users WHERE ${where}`, args);
  return rows[0].n;
};

module.exports = { listUsers, countUsers };
