const crypto = require('crypto');
const { query } = require('../../config/pg');
const { runInTransaction } = require('../_shared/unit-of-work');
const userMutations = require('../../controllers/user/user-mutations-repository');

const newId = () => crypto.randomBytes(12).toString('hex');
const exec = (tx, text, params) => (tx?.client ? tx.client.query(text, params) : query(text, params));

const userRow = (r) => (r == null ? null : ({
  _id: r.id,
  empCode: r.emp_code,
  name: r.name,
  email: r.email,
  department: r.department,
  position: r.position,
  status: r.status,
  role: r.role,
  canLogin: r.can_login,
  archiveEmployeeId: r.archive_employee_id || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
}));

const list = async ({ q, limit = 100, offset = 0 } = {}) => {
  const args = [];
  let search = '';
  if (q) {
    args.push(`%${q.replace(/([%_\\])/g, '\\$1')}%`);
    search = `AND (u.emp_code ILIKE $${args.length} OR u.name ILIKE $${args.length}
      OR COALESCE(u.email, '') ILIKE $${args.length})`;
  }
  args.push(limit, offset);
  const { rows } = await query(
    `SELECT u.id, u.emp_code, u.name, u.email, u.department, u.position,
            u.status, u.role, u.can_login, u.created_at, u.updated_at,
            ee.id AS archive_employee_id
       FROM users u
       LEFT JOIN eng_employees ee ON ee.user_id = u.id
      WHERE u.is_deleted = false
        AND (u.can_login = false OR ee.user_id IS NOT NULL)
        ${search}
      ORDER BY u.emp_code COLLATE "C"
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );
  return rows.map(userRow);
};

const count = async ({ q } = {}) => {
  const args = [];
  let search = '';
  if (q) {
    args.push(`%${q.replace(/([%_\\])/g, '\\$1')}%`);
    search = `AND (u.emp_code ILIKE $1 OR u.name ILIKE $1 OR COALESCE(u.email, '') ILIKE $1)`;
  }
  const { rows } = await query(
    `SELECT count(DISTINCT u.id)::int AS n
       FROM users u
       LEFT JOIN eng_employees ee ON ee.user_id = u.id
      WHERE u.is_deleted = false
        AND (u.can_login = false OR ee.user_id IS NOT NULL) ${search}`,
    args,
  );
  return rows[0].n;
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT u.*, ee.id AS archive_employee_id
       FROM users u LEFT JOIN eng_employees ee ON ee.user_id = u.id
      WHERE u.id = $1 AND u.is_deleted = false`,
    [String(id)],
  );
  return userRow(rows[0]);
};

const createManaged = (data) => userMutations.create({
  ...data,
  role: 'Participant',
  canLogin: false,
});

const updateManaged = (id, data) => userMutations.updateById(id, data);

const getOverview = async () => {
  const { rows } = await query(`
    SELECT
      (SELECT count(*)::int FROM eng_employees) AS archive_people,
      (SELECT count(*)::int FROM eng_employees WHERE user_id IS NOT NULL) AS linked_people,
      (SELECT count(*)::int FROM users WHERE can_login = false AND is_deleted = false) AS managed_people,
      (SELECT count(*)::int FROM eng_employees WHERE user_id IS NULL) AS unlinked_people
  `);
  return {
    archivePeople: rows[0].archive_people,
    linkedPeople: rows[0].linked_people,
    managedPeople: rows[0].managed_people,
    unlinkedPeople: rows[0].unlinked_people,
  };
};

const listTeachers = async () => {
  const { rows } = await query(
    `SELECT id, emp_code, name, email
       FROM users
      WHERE role = 'Teacher' AND status = 'Active' AND can_login = true AND is_deleted = false
      ORDER BY name COLLATE "C", emp_code COLLATE "C"`,
  );
  return rows.map((row) => ({
    _id: row.id,
    empCode: row.emp_code,
    name: row.name,
    email: row.email,
  }));
};

const listArchivePeopleForProvisioning = async () => {
  const { rows } = await query(
    `SELECT ee.id, ee.emp_code, ee.full_name, ee.email, ee.employment_status,
            ee.user_id, linked.is_deleted AS linked_user_deleted
       FROM eng_employees ee
       LEFT JOIN users linked ON linked.id = ee.user_id
      ORDER BY ee.emp_code COLLATE "C"`,
  );
  return rows;
};

const linkOrCreate = (archivePerson) => runInTransaction(async (tx) => {
  const normalizedCode = archivePerson.emp_code.trim().toUpperCase();
  const { rows: existingRows } = await exec(
    tx,
    `SELECT id, is_deleted FROM users WHERE upper(emp_code) = $1 ORDER BY is_deleted ASC FOR UPDATE`,
    [normalizedCode],
  );
  const active = existingRows.find((row) => !row.is_deleted);
  if (active) {
    await exec(tx, 'UPDATE eng_employees SET user_id = $2, updated_at = now() WHERE id = $1', [archivePerson.id, active.id]);
    return { outcome: 'linked', userId: active.id, empCode: normalizedCode };
  }
  if (existingRows.length > 0) {
    return { outcome: 'collision', empCode: normalizedCode, reason: 'A soft-deleted user already owns this employee code' };
  }

  const id = newId();
  await exec(tx, 'SAVEPOINT managed_user_insert', []);
  try {
    await exec(
      tx,
      `INSERT INTO users
        (id, emp_code, name, email, role, status, can_login, password, must_change_password)
       VALUES ($1, $2, $3, $4, 'Participant', $5, false, NULL, false)`,
      [
        id,
        normalizedCode,
        archivePerson.full_name.trim(),
        archivePerson.email?.trim().toLowerCase() || null,
        archivePerson.employment_status === 'inactive' ? 'Inactive' : 'Active',
      ],
    );
    await exec(tx, 'RELEASE SAVEPOINT managed_user_insert', []);
    await exec(tx, 'UPDATE eng_employees SET user_id = $2, updated_at = now() WHERE id = $1', [archivePerson.id, id]);
    return { outcome: 'created', userId: id, empCode: normalizedCode };
  } catch (error) {
    if (error?.code === '23505') {
      await exec(tx, 'ROLLBACK TO SAVEPOINT managed_user_insert', []);
      return { outcome: 'collision', empCode: normalizedCode, reason: 'Employee code or email is already in use' };
    }
    throw error;
  }
});

module.exports = {
  list,
  count,
  findById,
  createManaged,
  updateManaged,
  getOverview,
  listTeachers,
  listArchivePeopleForProvisioning,
  linkOrCreate,
};
