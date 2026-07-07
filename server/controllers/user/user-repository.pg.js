const crypto = require('crypto');
const { query } = require('../../config/pg');

// user-repository — POSTGRES impl (users table, migs 001/030/031). Same
// interface as ./user-repository.mongo.
//
// Fidelity notes the parity test pins:
//   • bulkUpsertUsersByEmpCode conflicts on the PARTIAL unique
//     uq_users_emp_code_active (WHERE is_deleted = false) — a trashed row does
//     not conflict, but the service-level trash guard refuses those upfront
//     (same DATA-013 flow as Mongo, whose pre-load is hook-filtered).
//   • counts mirror Mongo bulkWrite: upsertedCount = fresh inserts;
//     matchedCount = modifiedCount = items that hit an existing live row —
//     Mongoose timestamps bump updatedAt on every matched doc, so Mongo's
//     modifiedCount equals matched even for an identical re-import; the PG
//     DO UPDATE mirrors that (always writes, bumps updated_at).
//   • $setOnInsert (password/mustChangePassword/role) applies on INSERT only —
//     DO UPDATE never touches those columns (DATA-010 role guard).

const newId = () => crypto.randomBytes(12).toString('hex');
const exec = (tx, text, params) => (tx && tx.client ? tx.client.query(text, params) : query(text, params));

const findTrashedUserEmpCodes = async (empCodes) => {
  const { rows } = await query(
    'SELECT emp_code FROM users WHERE emp_code = ANY($1::text[]) AND is_deleted = true',
    [empCodes.map(String)]);
  return rows.map((r) => r.emp_code);
};

const findLiveUserEmpCodes = async (empCodes) => {
  const { rows } = await query(
    'SELECT emp_code FROM users WHERE emp_code = ANY($1::text[]) AND is_deleted = false',
    [empCodes.map(String)]);
  return rows.map((r) => r.emp_code);
};

// camelCase field → users column (the import's bounded $set/$setOnInsert keys).
const USER_COLS = {
  empCode: 'emp_code', name: 'name', email: 'email', department: 'department',
  status: 'status', role: 'role', password: 'password', mustChangePassword: 'must_change_password',
};

const bulkUpsertUsersByEmpCode = async (items, tx) => {
  let upsertedCount = 0;
  let modifiedCount = 0;
  let matchedCount = 0;
  for (const { set, setOnInsert } of items) {
    const insertFields = { ...set, ...(setOnInsert || {}) };
    const cols = [];
    const vals = [];
    for (const [k, col] of Object.entries(USER_COLS)) {
      if (insertFields[k] === undefined) continue;
      cols.push(col);
      vals.push(insertFields[k]);
    }
    const updateCols = Object.entries(USER_COLS)
      .filter(([k]) => set[k] !== undefined && k !== 'empCode')
      .map(([, col]) => col);
    const setClause = updateCols.length
      ? updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')
      : 'emp_code = EXCLUDED.emp_code';
    // RETURNING (xmax = 0) → true when the row was freshly INSERTED; false on
    // DO UPDATE. Matched rows always update (updated_at bump ⇔ Mongoose
    // timestamps), so modified == matched — same as Mongo bulkWrite.
    // eslint-disable-next-line no-await-in-loop -- bounded by import batch size
    const { rows } = await exec(tx,
      `INSERT INTO users(id, ${cols.join(', ')})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (emp_code) WHERE is_deleted = false
       DO UPDATE SET ${setClause}, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [newId(), ...vals]);
    if (rows[0] && rows[0].inserted) {
      upsertedCount += 1;
    } else {
      matchedCount += 1;
      modifiedCount += 1;
    }
  }
  return { upsertedCount, modifiedCount, matchedCount };
};

// ── Soft-delete lifecycle (Phase 5 slice 4, B1) ─────────────────────────────
// Fidelity notes:
//   • Team.members ⇔ the team_members junction — the "pull from all teams"
//     is a junction DELETE; modifiedCount = DISTINCT teams affected.
//   • `_softDeletedEmail` has no column — it rides users.meta jsonb (parking
//     is reversible; restore clears the key).
//   • the partial uniques (uq_users_emp_code_active / uq_users_email_active,
//     WHERE is_deleted = false) stay satisfied: the parked row is deleted.

const userRow = (r) => {
  if (r == null) return null;
  const meta = r.meta || {};
  return {
    _id: r.id, empCode: r.emp_code, name: r.name, email: r.email,
    department: r.department, role: r.role, status: r.status,
    isDeleted: r.is_deleted, deletedAt: r.deleted_at,
    _softDeletedEmail: meta._softDeletedEmail == null ? null : meta._softDeletedEmail,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
};

const findLiveUserById = async (id) => {
  const { rows } = await query(
    'SELECT * FROM users WHERE id = $1 AND is_deleted = false', [String(id)]);
  return userRow(rows[0]);
};

const findTeamsLedByUser = async (userId) => {
  const { rows } = await query(
    'SELECT id, name FROM teams WHERE leader_id = $1 AND is_deleted = false', [String(userId)]);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};

const pullUserFromAllTeams = async (userId, tx) => {
  const { rows } = await exec(tx,
    'DELETE FROM team_members WHERE user_id = $1 RETURNING team_id', [String(userId)]);
  return { modifiedCount: new Set(rows.map((r) => r.team_id)).size };
};

const bulkDropActiveEnrollmentsByUser = async (userId, tx) => {
  const { rowCount } = await exec(tx,
    `UPDATE enrollments SET status = 'Dropped', left_at = now(), updated_at = now()
      WHERE user_id = $1 AND status = 'Active'`, [String(userId)]);
  return { modifiedCount: rowCount };
};

const softDeleteUserWithParking = async (userId, { releasedEmpCode, releasedEmail }, tx) => {
  await exec(tx,
    `UPDATE users
        SET is_deleted = true, deleted_at = now(), status = 'Dropped',
            emp_code = $2, email = NULL,
            meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('_softDeletedEmail', $3::text),
            updated_at = now()
      WHERE id = $1`,
    [String(userId), releasedEmpCode, releasedEmail]);
};

const findDeletedUserById = async (id) => {
  const { rows } = await query(
    'SELECT * FROM users WHERE id = $1 AND is_deleted = true', [String(id)]);
  return userRow(rows[0]);
};

const findActiveUserByEmpCode = async (empCode) => {
  const { rows } = await query(
    'SELECT id FROM users WHERE emp_code = $1 AND is_deleted = false LIMIT 1', [empCode]);
  return rows[0] || null;
};

const findActiveUserByEmail = async (email) => {
  const { rows } = await query(
    'SELECT id FROM users WHERE email = $1 AND is_deleted = false LIMIT 1', [email]);
  return rows[0] || null;
};

const restoreUserIdentity = async (id, { empCode, email }) => {
  await query(
    `UPDATE users
        SET is_deleted = false, deleted_at = NULL, status = 'Inactive',
            emp_code = $2, email = $3,
            meta = COALESCE(meta, '{}'::jsonb) - '_softDeletedEmail',
            updated_at = now()
      WHERE id = $1`,
    [String(id), empCode, email]);
};

module.exports = {
  findTrashedUserEmpCodes, findLiveUserEmpCodes, bulkUpsertUsersByEmpCode,
  findLiveUserById, findTeamsLedByUser, pullUserFromAllTeams,
  bulkDropActiveEnrollmentsByUser, softDeleteUserWithParking,
  findDeletedUserById, findActiveUserByEmpCode, findActiveUserByEmail, restoreUserIdentity,
};
