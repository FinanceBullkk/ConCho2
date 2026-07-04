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
// and mfaSecret), mirroring the explicit +selects on the select:false fields.
const findForLogin = (empCode) =>
  User.findOne({ empCode })
    .select('+password +failedLoginAttempts +lockUntil +mfaSecret')
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
// the replay counter (all select:false).
const findForMfaVerify = (userId) =>
  User.findById(userId)
    .select('+mfaSecret +mfaBackupCodes +mfaLastUsedCounter')
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

module.exports = {
  findForLogin,
  recordFailedLoginAttempt,
  resetLoginCounters,
  findForMfaVerify,
  saveMfaLastUsedCounter,
  saveMfaBackupCodes,
  findAuthUserById,
};
