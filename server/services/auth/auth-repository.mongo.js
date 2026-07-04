const User = require('../../models/User');

// auth-repository — MONGO impl (Phase 3 Wave-E slice E3: login + middleware).
// The User-model touches of auth-login.js + middleware/auth.js, extracted
// verbatim so the Postgres twin swaps cleanly. Rows are LEAN plain objects on
// both backends (the service compares passwords with bcrypt directly — no
// hydrated instance methods). The model's soft-delete find-hooks keep
// deleted users invisible, exactly like the pg impl's is_deleted predicates.
// E4 (password change/reset, MFA setup/disable, admin force-logout) extends
// this same seam.

// Login lookup — the ONLY reader that surfaces `password` (+ lockout state
// and mfaSecret). EXPLICIT inclusion projection (was an additive +select):
// both backends return the same fixed field set, and nothing beyond what the
// login flow actually reads travels in memory.
const findForLogin = (empCode) =>
  User.findOne({ empCode })
    .select('empCode name role department status mustChangePassword mfaEnabled +password +failedLoginAttempts +lockUntil +mfaSecret')
    .lean();

// Atomic failed-login roll (F2 audit fix — single pipeline update, no
// read-modify-write race): counter+1; at max → reset to 0 AND set lockUntil.
// Returns the post-update counters ({new:true}).
const recordFailedLoginAttempt = async (userId, { maxAttempts, lockMinutes }) => {
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    [
      { $set: { _na: { $add: [{ $ifNull: ['$failedLoginAttempts', 0] }, 1] } } },
      {
        $set: {
          failedLoginAttempts: {
            $cond: [{ $gte: ['$_na', maxAttempts] }, 0, '$_na'],
          },
          lockUntil: {
            $cond: [
              { $gte: ['$_na', maxAttempts] },
              { $add: ['$$NOW', lockMinutes * 60 * 1000] },
              '$lockUntil',
            ],
          },
        },
      },
      { $unset: '_na' },
    ],
    { new: true, select: '+failedLoginAttempts +lockUntil' },
  ).lean();
  return updated
    ? { failedLoginAttempts: updated.failedLoginAttempts, lockUntil: updated.lockUntil ?? null }
    : null;
};

const resetLoginCounters = (userId) =>
  User.updateOne({ _id: userId }, { $set: { failedLoginAttempts: 0, lockUntil: null } });

// MFA second-leg lookup — surfaces the TOTP secret, backup-code hashes and
// the replay counter (all select:false). Explicit inclusion projection for
// the same fixed-shape reason as findForLogin.
const findForMfaVerify = (userId) =>
  User.findById(userId)
    .select('empCode name role department status mustChangePassword mfaEnabled +mfaSecret +mfaBackupCodes +mfaLastUsedCounter')
    .lean();

// Persist the absolute TOTP step counter (SEC-018 replay guard).
const saveMfaLastUsedCounter = (userId, counter) =>
  User.updateOne({ _id: userId }, { $set: { mfaLastUsedCounter: counter } });

// Persist the remaining backup-code hashes after a single-use consume.
const saveMfaBackupCodes = (userId, codes) =>
  User.updateOne({ _id: userId }, { $set: { mfaBackupCodes: codes } });

// Per-request middleware lookup (cached 30s by the caller) — the fixed
// 10-field projection; NEVER add password/mfaSecret here.
const findAuthUserById = (userId) =>
  User.findById(userId)
    .select('_id empCode name role department departmentId status passwordChangedAt mfaEnabled mustChangePassword')
    .lean();

// ── E4 — auth mutations (password change/reset, MFA lifecycle, admin) ───────

// Re-auth / change-password read: {_id, empCode, password} only. (A bare
// '+password' is not an inclusive projection — empCode anchors inclusion.)
const findByIdWithPassword = (userId) =>
  User.findById(userId).select('empCode +password').lean();

// changePassword write. Callers hash + set passwordChangedAt = now()-1s
// themselves (mirroring the User pre('save') hook — update writes skip it).
const updatePassword = (userId, { passwordHash, passwordChangedAt, mustChangePassword }) =>
  User.updateOne(
    { _id: userId },
    { $set: { password: passwordHash, passwordChangedAt, mustChangePassword } },
  );

// MFA enrollment (setup → verify-setup) + disable.
const setMfaPendingSecret = (userId, secret, expiresAt) =>
  User.updateOne(
    { _id: userId },
    { $set: { mfaPendingSecret: secret, mfaPendingSecretExpires: expiresAt } },
  );

const findForMfaSetupVerify = (userId) =>
  User.findById(userId).select('_id +mfaPendingSecret +mfaPendingSecretExpires').lean();

const clearMfaPendingSecret = (userId) =>
  User.updateOne(
    { _id: userId },
    { $set: { mfaPendingSecret: null, mfaPendingSecretExpires: null } },
  );

// Promote the proven pending secret to permanent + enable (F5 two-step).
const enableMfa = (userId, { secret, backupCodes }) =>
  User.updateOne(
    { _id: userId },
    {
      $set: {
        mfaSecret: secret,
        mfaPendingSecret: null,
        mfaPendingSecretExpires: null,
        mfaEnabled: true,
        mfaBackupCodes: backupCodes,
      },
    },
  );

const findForMfaDisable = (userId) =>
  User.findById(userId).select('_id mfaEnabled +mfaSecret +mfaBackupCodes').lean();

// Shared by self-disable AND the admin override.
const disableMfa = (userId) =>
  User.updateOne(
    { _id: userId },
    { $set: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] } },
  );

// Admin handlers' target lookup: {_id, empCode, role}.
const findUserRef = (userId) =>
  User.findById(userId).select('_id empCode role').lean();

// Force-logout kill switch — the middleware rejects any token with
// iat < passwordChangedAt, catching sessions the JTI blocklist can't.
const bumpPasswordChangedAt = (userId) =>
  User.updateOne({ _id: userId }, { $set: { passwordChangedAt: new Date() } });

// ── Password reset (forgot / reset) ─────────────────────────────────────────
// The empCode schema setter (uppercase+trim) applies to the query value, so a
// lower-cased lookup still matches — the pg impl mirrors with upper().
const findForPasswordReset = (empCode) =>
  User.findOne({ empCode })
    .select('_id email name passwordResetToken passwordResetExpires')
    .lean();

const savePasswordResetToken = (userId, tokenHash, expiresAt) =>
  User.updateOne(
    { _id: userId },
    { $set: { passwordResetToken: tokenHash, passwordResetExpires: expiresAt } },
  );

const clearPasswordResetToken = (userId) =>
  User.updateOne(
    { _id: userId },
    { $set: { passwordResetToken: null, passwordResetExpires: null } },
  );

// Atomic find-and-clear (double-spend guard): the first concurrent consume
// claims the row; later ones find no match → null. passwordChangedAt = now()
// exactly (this manual path never had the pre-save -1s skew).
const consumePasswordResetToken = (tokenHash, passwordHash) =>
  User.findOneAndUpdate(
    { passwordResetToken: tokenHash, passwordResetExpires: { $gt: new Date() } },
    {
      $set: {
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
      },
    },
    { new: true, select: '_id empCode' },
  ).lean();

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
