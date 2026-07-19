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
  canLogin: r.can_login,
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
  canLogin: r.can_login,
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
  canLogin: r.can_login,
  passwordChangedAt: r.password_changed_at,
  mfaEnabled: r.mfa_enabled,
  mustChangePassword: r.must_change_password,
});

// ── Login path ───────────────────────────────────────────────────────────────
const findForLogin = async (empCode) => {
  const { rows } = await query(
    `SELECT id, emp_code, name, role, department, status, can_login, must_change_password,
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
    `SELECT id, emp_code, name, role, department, status, can_login, must_change_password,
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
    `SELECT id, emp_code, name, role, department, department_id, status, can_login,
            password_changed_at, mfa_enabled, must_change_password
       FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return authUserRow(rows[0]);
};

// ── E4 — auth mutations (password change/reset, MFA lifecycle, admin) ───────

const findByIdWithPassword = async (userId) => {
  const { rows } = await query(
    `SELECT id, emp_code, password, can_login FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return rows[0]
    ? { _id: rows[0].id, empCode: rows[0].emp_code, password: rows[0].password, canLogin: rows[0].can_login }
    : null;
};

const updatePassword = (userId, { passwordHash, passwordChangedAt, mustChangePassword }) =>
  query(
    `UPDATE users SET password = $2, password_changed_at = $3,
            must_change_password = $4, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId), passwordHash, passwordChangedAt, mustChangePassword]
  );

const setMfaPendingSecret = (userId, secret, expiresAt) =>
  query(
    `UPDATE users SET mfa_pending_secret = $2, mfa_pending_secret_expires = $3, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId), secret, expiresAt]
  );

const findForMfaSetupVerify = async (userId) => {
  const { rows } = await query(
    `SELECT id, mfa_pending_secret, mfa_pending_secret_expires
       FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return rows[0]
    ? {
        _id: rows[0].id,
        mfaPendingSecret: rows[0].mfa_pending_secret,
        mfaPendingSecretExpires: rows[0].mfa_pending_secret_expires,
      }
    : null;
};

const clearMfaPendingSecret = (userId) =>
  query(
    `UPDATE users SET mfa_pending_secret = NULL, mfa_pending_secret_expires = NULL, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );

const enableMfa = (userId, { secret, backupCodes }) =>
  query(
    `UPDATE users SET mfa_secret = $2, mfa_pending_secret = NULL,
            mfa_pending_secret_expires = NULL, mfa_enabled = true,
            mfa_backup_codes = $3::text[], updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId), secret, backupCodes]
  );

const findForMfaDisable = async (userId) => {
  const { rows } = await query(
    `SELECT id, mfa_enabled, mfa_secret, mfa_backup_codes
       FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return rows[0]
    ? {
        _id: rows[0].id,
        mfaEnabled: rows[0].mfa_enabled,
        mfaSecret: rows[0].mfa_secret,
        mfaBackupCodes: rows[0].mfa_backup_codes || [],
      }
    : null;
};

const disableMfa = (userId) =>
  query(
    `UPDATE users SET mfa_enabled = false, mfa_secret = NULL,
            mfa_backup_codes = '{}'::text[], updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );

const findUserRef = async (userId) => {
  const { rows } = await query(
    `SELECT id, emp_code, role FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );
  return rows[0] ? { _id: rows[0].id, empCode: rows[0].emp_code, role: rows[0].role } : null;
};

const bumpPasswordChangedAt = (userId) =>
  query(
    `UPDATE users SET password_changed_at = now(), updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );

// ── Password reset (forgot / reset) ─────────────────────────────────────────
// upper() mirrors the Mongo empCode schema setter applying to query values.
const findForPasswordReset = async (empCode) => {
  const { rows } = await query(
    `SELECT id, email, name, password_reset_token, password_reset_expires
       FROM users WHERE emp_code = upper($1) AND is_deleted = false AND can_login = true`,
    [empCode]
  );
  return rows[0]
    ? {
        _id: rows[0].id,
        email: rows[0].email,
        name: rows[0].name,
        passwordResetToken: rows[0].password_reset_token,
        passwordResetExpires: rows[0].password_reset_expires,
      }
    : null;
};

const savePasswordResetToken = (userId, tokenHash, expiresAt) =>
  query(
    `UPDATE users SET password_reset_token = $2, password_reset_expires = $3, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId), tokenHash, expiresAt]
  );

const clearPasswordResetToken = (userId) =>
  query(
    `UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL, updated_at = now()
     WHERE id = $1 AND is_deleted = false`,
    [String(userId)]
  );

// One atomic UPDATE claims the row (double-spend guard ⇔ Mongo findOneAndUpdate).
const consumePasswordResetToken = async (tokenHash, passwordHash) => {
  const { rows } = await query(
    `UPDATE users SET password = $2, password_reset_token = NULL,
            password_reset_expires = NULL, password_changed_at = now(), updated_at = now()
     WHERE password_reset_token = $1 AND password_reset_expires > now()
       AND is_deleted = false AND can_login = true
     RETURNING id, emp_code`,
    [tokenHash, passwordHash]
  );
  return rows[0] ? { _id: rows[0].id, empCode: rows[0].emp_code } : null;
};

module.exports = {
  findForLogin,
  recordFailedLoginAttempt,
  resetLoginCounters,
  findForMfaVerify,
  saveMfaLastUsedCounter,
  saveMfaBackupCodes,
  findAuthUserById,
  findByIdWithPassword,
  updatePassword,
  setMfaPendingSecret,
  findForMfaSetupVerify,
  clearMfaPendingSecret,
  enableMfa,
  findForMfaDisable,
  disableMfa,
  findUserRef,
  bumpPasswordChangedAt,
  findForPasswordReset,
  savePasswordResetToken,
  clearPasswordResetToken,
  consumePasswordResetToken,
};
