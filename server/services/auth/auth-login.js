const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authRepository = require('./auth-repository');
const mfaService = require('../mfaService');
const auditService = require('../auditService');
const logger = require('../../lib/logger');
const { ServiceError } = require('../../helpers/ServiceError');
const {
  generateToken,
  generateMfaPendingToken,
  generateMfaEnrollmentToken,
  getCookieOptions,
  isMfaRequiredForRole,
} = require('./auth-tokens');

// ──────────────────────────────────────────────────────────
// Auth Service — credential flows
// ──────────────────────────────────────────────────────────
// Split from the legacy authService (Phase 1 modular-monolith).
// Password authentication (with durable per-account lockout) and the MFA
// second-leg verification. Token/cookie minting lives in auth-tokens.

// Defense-in-depth lockout. The express-rate-limit `loginLimiter` blocks
// *requests* per IP+empCode; this lock is per-account, durable in DB,
// and survives instance restarts. After MAX_FAILED consecutive failures,
// the account is locked for LOCK_MINUTES regardless of source IP.
const MAX_FAILED_ATTEMPTS = Number(process.env.LOGIN_MAX_FAILED || 10);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

/**
 * Authenticate a user with empCode + password.
 *
 * @param {string} empCode
 * @param {string} password
 * @param {Object} [req] - Optional Express request for audit context (IP/UA).
 *                         Service-level callers (cron, scripts) may omit it.
 * @returns {Object} { token, user, cookieOptions }
 */
const authenticate = async (empCode, password, req = null) => {
  if (!empCode || !password) {
    throw new ServiceError('Please provide empCode and password');
  }

  const normalizedCode = empCode.trim().toUpperCase();

  const user = await authRepository.findForLogin(normalizedCode);
  if (!user) {
    // Generic message — do not reveal whether the account exists.
    throw new ServiceError('Invalid credentials', 401);
  }

  // Managed training-only people deliberately have no credentials. Check this
  // before lockout/password work so a null password never reaches bcrypt and
  // login attempts cannot mutate lock counters for a non-login identity.
  if (user.canLogin === false) {
    throw new ServiceError('Account access is disabled. Contact admin.', 403);
  }

  // Honor active lockout. Generic 401 (not 423) so attackers can't
  // distinguish "locked" from "wrong password" via status code.
  if (user.lockUntil && user.lockUntil > new Date()) {
    logger.warn({ empCode: normalizedCode, lockUntil: user.lockUntil }, 'Login attempt on locked account');
    throw new ServiceError('Invalid credentials', 401);
  }

  if (user.status !== 'Active') {
    throw new ServiceError(`Account is ${user.status}. Contact admin.`, 403);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    // Single atomic counter roll in the repository — avoids read-modify-write
    // race when concurrent bad-login requests arrive simultaneously (F2 audit
    // fix; Mongo aggregation-pipeline update ⇄ PG CASE update).
    const updated = await authRepository.recordFailedLoginAttempt(user._id, {
      maxAttempts: MAX_FAILED_ATTEMPTS,
      lockMinutes: LOCK_MINUTES,
    });
    if (updated?.lockUntil && updated.lockUntil > new Date()) {
      logger.warn({ empCode: normalizedCode }, 'Account locked due to repeated failed login attempts');
      // Audit PR L (SEC-013): record the lockout transition (not every failed
      // login — too noisy). Tied to the user so the audit trail shows the
      // account's history; req captures the IP that triggered the final
      // failure so we can correlate with the rate-limit logs.
      auditService.record({
        req,
        action: 'account-locked',
        entity: 'Auth',
        entityId: user._id,
        note: `empCode=${normalizedCode}, lockUntil=${updated.lockUntil.toISOString()}`,
      });
    }
    throw new ServiceError('Invalid credentials', 401);
  }

  // The Teacher role has been retired from the platform. Credentials may still
  // verify (the role remains in the backend authz layer for historical data and
  // audit), but no one can obtain a session as a Teacher. Training operations are
  // Admin/Coordinator-driven now.
  if (user.role === 'Teacher') {
    throw new ServiceError('The Teacher role has been retired. Contact an administrator.', 403);
  }

  // Successful login — clear any failure state.
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    await authRepository.resetLoginCounters(user._id);
  }

  // If MFA is enabled, do NOT issue a full session. Issue a short-lived
  // pending token; the client must call /api/auth/mfa/verify with a TOTP
  // (or backup) code to complete login.
  if (user.mfaEnabled) {
    return {
      mfaRequired: true,
      mfaPendingToken: generateMfaPendingToken(user._id),
    };
  }

  // MFA enforcement: this user's role requires MFA but they haven't enrolled.
  // Issue an enrollment-required token; the controller will set it as the
  // session cookie. Auth middleware restricts this token to MFA setup
  // endpoints only — the user is locked out of everything else until they
  // complete enrollment.
  if (isMfaRequiredForRole(user.role)) {
    logger.info(
      { empCode: user.empCode, role: user.role },
      'User logged in but MFA enrollment is required by policy'
    );
    return {
      mfaEnrollmentRequired: true,
      enrollmentToken: generateMfaEnrollmentToken(user._id),
      cookieOptions: getCookieOptions(),
      user: {
        _id: user._id,
        empCode: user.empCode,
        name: user.name,
        role: user.role,
        department: user.department,
        status: user.status,
        mfaEnabled: false,
        mustChangePassword: !!user.mustChangePassword,
        mfaEnrollmentRequired: true,
      },
    };
  }

  const token = generateToken(user._id);

  return {
    token,
    cookieOptions: getCookieOptions(),
    user: {
      _id: user._id,
      empCode: user.empCode,
      name: user.name,
      role: user.role,
      department: user.department,
      status: user.status,
      mustChangePassword: !!user.mustChangePassword,
    },
  };
};

/**
 * Second leg of MFA-protected login. Caller passes the mfa-pending token
 * (issued by authenticate()) plus a 6-digit TOTP code or a backup code.
 *
 * On success: returns the same shape as a normal authenticate() response.
 *
 * @param {string} mfaPendingToken
 * @param {string} code
 * @param {Object} [req] - Optional Express request for audit context.
 */
const verifyMfaLogin = async (mfaPendingToken, code, req = null) => {
  if (!mfaPendingToken || !code) {
    throw new ServiceError('mfaPendingToken and code are required');
  }

  let decoded;
  try {
    decoded = jwt.verify(mfaPendingToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    throw new ServiceError('MFA challenge expired. Please log in again.', 401);
  }
  if (decoded.mfa !== 'pending') {
    throw new ServiceError('Invalid MFA challenge token', 401);
  }

  const user = await authRepository.findForMfaVerify(decoded.id);
  // P2 fix: also check account is Active — a suspended account must not be
  // able to complete the MFA second-leg and obtain a full session token.
  if (!user || user.canLogin === false || !user.mfaEnabled || !user.mfaSecret || user.status !== 'Active') {
    // Generic message — don't reveal why (account existence / MFA state / suspension).
    throw new ServiceError('Invalid MFA challenge', 401);
  }

  // Try TOTP first (with replay protection); fall back to backup codes.
  let backupCodeUsed = false;
  let ok = false;

  const { valid: totpValid, counter } = mfaService.verifyTokenWithReplay(
    user.mfaSecret,
    code,
    user.mfaLastUsedCounter,
  );

  if (totpValid) {
    // Persist the absolute step counter so any code from this step (or earlier)
    // cannot be replayed, while a later step still logs in (SEC-018 fix).
    await authRepository.saveMfaLastUsedCounter(user._id, counter);
    ok = true;
  } else {
    const remaining = await mfaService.consumeBackupCode(user.mfaBackupCodes || [], code);
    if (remaining) {
      await authRepository.saveMfaBackupCodes(user._id, remaining);
      backupCodeUsed = true;
      ok = true;
      logger.warn(
        { userId: user._id.toString(), remaining: remaining.length },
        'MFA backup code consumed'
      );
    }
  }

  if (!ok) {
    // Audit PR L (SEC-013): MFA second-leg failures are interesting because
    // a streak indicates either a forgotten authenticator or an attempted
    // brute-force after password compromise. Rate-limiter (mfaVerifyLimiter)
    // already bucket-limits these; the audit row gives a durable trail.
    auditService.record({
      req,
      action: 'mfa-verify-failed',
      entity: 'Auth',
      entityId: user._id,
      note: `empCode=${user.empCode}`,
    });
    throw new ServiceError('Invalid MFA code', 401);
  }

  const token = generateToken(user._id);

  return {
    token,
    cookieOptions: getCookieOptions(),
    backupCodeUsed,
    user: {
      _id: user._id,
      empCode: user.empCode,
      name: user.name,
      role: user.role,
      department: user.department,
      status: user.status,
      mustChangePassword: !!user.mustChangePassword,
    },
  };
};

module.exports = { authenticate, verifyMfaLogin };
