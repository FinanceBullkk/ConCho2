const { query } = require('../../config/pg');

// auth-repository — POSTGRES impl (Phase 3 Wave-E slice E3, mig 030).
// Same interface as ./auth-repository.mongo; rows are plain objects shaped
// like the Mongo lean rows.
//
// Fidelity notes the parity test pins:
//   • select:false parity — password/mfa*/lockout columns appear ONLY in the
//     explicit security readers (findForLogin/findForMfaVerify); the
//     middleware projection (findAuthUserById) never selects them.
//   • soft-delete: every read/write carries `is_deleted = false` — the SQL
//     analogue of the User model's find-hook injection.
//   • the failed-login roll is ONE atomic UPDATE (row lock) mirroring the
//     Mongo aggregation-pipeline update: counter+1; at max → 0 + lock_until.
//   • bigint (mfa_last_used_counter) comes back as a string from node-pg →
//     normalized to Number; text[] backup codes NULL → [] (Mongo default).
//   • writes bump updated_at = now() (Mongoose updateOne bumps updatedAt).

const num = (v) => (v == null ? null : Number(v));

// ── Row shapes (match the Mongo lean projections) ────────────────────────────
const loginRow = (r) => (r == null ? null : {
  _id: r.id,
  empCode: r.emp_code,
  name: r.name,
  role: r.role,
  department: r.department,
  status: r.status,
  mustChangePassword: r.must_change_password,
  mfaEnabled: r.mfa_enabled,
  password: r.password,
  failedLoginAttempts: Number(r.failed_login_attempts),
  lockUntil: r.lock_until,
  mfaSecret: r.mfa_secret,
});

const mfaVerifyRow = (r) => (r == null ? null : {
  _id: r.id,
  empCode: r.emp_code,
  name: r.name,
  role: r.role,
  department: r.department,
  status: r.status,
  mustChangePassword: r.must_change_password,
  mfaEnabled: r.mfa_enabled,
  mfaSecret: r.mfa_secret,
  mfaBackupCodes: r.mfa_backup_codes || [],
  mfaLastUsedCounter: num(r.mfa_last_used_counter),
});

const authUserRow = (r) => (r == null ? null : {
  _id: r.id,
  empCode: r.emp_code,
  name: r.name,
  role: r.role,
  department: r.department,
  departmentId: r.department_id,
  status: r.status,
  passwordChangedAt: r.password_changed_at,
  mfaEnabled: r.mfa_enabled,
  mustChangePassword: r.must_change_password,
});

// ── Login path ───────────────────────────────────────────────────────────────
const findForLogin = async (empCode) => {
  const { rows } = await query(
    `SELECT id, emp_code, name, role, department, status, must_change_password,
            mfa_enabled, password, failed_login_attempts, lock_until, mfa_secret
       FROM users WHERE emp_code = $1 AND is_deleted = false`,
    [empCode]
  );
  return loginRow(rows[0]);
};

const recordFailedLoginAttempt = async (userId, { maxAttempts, lockMinutes }) => {
  const { rows } = await query(
    `UPDATE users SET
       failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= $2
                                    THEN 0 ELSE failed_login_attempts + 1 END,
       lock_until            = CASE WHEN failed_login_attempts + 1 >= $2
                                    THEN now() + make_interval(mins => $3)
                                    ELSE lock_until END,
       updated_at = now()
     WHERE id = $1 AND is_deleted = false
     RETURNING failed_login_attempts, lock_until`,
    [String(userId), maxAttempts, lockMinutes]
  );
  return rows[0]
    ? { failedLoginAttempts: Number(rows[0].failed_login_attempts), lockUntil: rows[0].lock_until }
    : null;
};

const resetLoginCounters = (userId) =>
  query(
    `UPDATE users SET failed_login_attempts = 0, lock_until = NULL, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );

// ── MFA second leg ───────────────────────────────────────────────────────────
const findForMfaVerify = async (userId) => {
  const { rows } = await query(
    `SELECT id, emp_code, name, role, department, status, must_change_password,
            mfa_enabled, mfa_secret, mfa_backup_codes, mfa_last_used_counter
       FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return mfaVerifyRow(rows[0]);
};

const saveMfaLastUsedCounter = (userId, counter) =>
  query(
    `UPDATE users SET mfa_last_used_counter = $2, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId), counter]
  );

const saveMfaBackupCodes = (userId, codes) =>
  query(
    `UPDATE users SET mfa_backup_codes = $2::text[], updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId), codes]
  );

// ── Middleware projection (NEVER add password/mfa_secret here) ───────────────
const findAuthUserById = async (userId) => {
  const { rows } = await query(
    `SELECT id, emp_code, name, role, department, department_id, status,
            password_changed_at, mfa_enabled, must_change_password
       FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return authUserRow(rows[0]);
};

module.exports = {
  findForLogin,
  recordFailedLoginAttempt,
  resetLoginCounters,
  findForMfaVerify,
  saveMfaLastUsedCounter,
  saveMfaBackupCodes,
  findAuthUserById,
};
