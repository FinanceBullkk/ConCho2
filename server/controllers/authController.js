const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const authService = require('../services/authService');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');
const { sendMail } = require('../lib/mailer');
const logger = require('../lib/logger');
const { rotateCsrfToken } = require('../middleware/csrfProtection');

// ──────────────────────────────────────────────────────────
// Auth Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { empCode, password } = req.body;
    const result = await authService.authenticate(empCode, password);

    // Two-step login: MFA is enabled — store the pending token in an
    // HttpOnly cookie (P3 fix) instead of the JSON body. XSS cannot read
    // HttpOnly cookies, so a compromised page cannot steal the token and
    // attempt the second factor from another device.
    if (result.mfaRequired) {
      res.cookie(
        authService.MFA_PENDING_COOKIE,
        result.mfaPendingToken,
        authService.getMfaPendingCookieOptions(),
      );
      return res.json({
        success: true,
        data: { mfaRequired: true },
      });
    }

    // MFA enforcement path: user role requires MFA but no enrollment yet.
    // Set the enrollment-required token AS the session cookie. The auth
    // middleware will only allow this token to hit MFA setup endpoints
    // until enrollment completes.
    if (result.mfaEnrollmentRequired) {
      res.cookie('tms_token', result.enrollmentToken, result.cookieOptions);
      rotateCsrfToken(res); // Rotate CSRF on every session boundary (#7)
      auditService.record({
        req: { ...req, user: { _id: result.user._id, role: result.user.role, empCode: result.user.empCode } },
        action: 'logged-in-enrollment-required',
        entity: 'Auth',
        entityId: result.user._id,
        note: 'MFA enrollment required by policy — locked to setup flow',
      });
      return res.json({
        success: true,
        data: { user: result.user, mfaEnrollmentRequired: true },
      });
    }

    const { token, user, cookieOptions } = result;
    res.cookie('tms_token', token, cookieOptions);
    rotateCsrfToken(res); // Rotate CSRF on every session boundary (#7)

    auditService.record({
      req: { ...req, user: { _id: user._id, role: user.role, empCode: user.empCode } },
      action: 'logged-in',
      entity: 'Auth',
      entityId: user._id,
    });

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/mfa/verify
 *
 * Second leg of MFA-protected login. Body: { code } only.
 * The mfaPendingToken is now read from the tms_mfa_pending HttpOnly cookie
 * (P3 fix) — the browser sends it automatically; the client never sees it.
 * On success, sets the regular session cookie and clears the pending cookie.
 */
const mfaVerifyLogin = async (req, res) => {
  try {
    const { code } = req.body;
    // Read the pending token from the HttpOnly cookie set during /login.
    const mfaPendingToken = req.cookies?.[authService.MFA_PENDING_COOKIE];

    const { token, user, cookieOptions, backupCodeUsed } =
      await authService.verifyMfaLogin(mfaPendingToken, code);

    // Consume the pending cookie — it must not be reusable after a successful
    // second factor (even though the JWT itself would reject a second use).
    res.clearCookie(authService.MFA_PENDING_COOKIE, { path: '/' });

    res.cookie('tms_token', token, cookieOptions);
    rotateCsrfToken(res); // Rotate CSRF on every session boundary (#7)

    auditService.record({
      req: { ...req, user: { _id: user._id, role: user.role, empCode: user.empCode } },
      action: 'logged-in',
      entity: 'Auth',
      entityId: user._id,
      note: backupCodeUsed ? 'MFA verified via backup code' : 'MFA verified via TOTP',
    });

    res.json({
      success: true,
      data: { user, backupCodeUsed: !!backupCodeUsed },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/mfa/setup
 *
 * Step 1 of enrolling MFA on the caller's own account. Returns a fresh
 * secret + QR code. Caller must complete enrollment with verify-setup.
 *
 * NOTE: We don't persist mfaEnabled=true here. The user must prove
 * possession of the device first by passing back a valid 6-digit code
 * via /mfa/verify-setup.
 */
const mfaSetup = async (req, res) => {
  try {
    const mfaService = require('../services/mfaService');
    const User = require('../models/User');

    const setup = await mfaService.generateSetup(req.user.empCode);

    // Store in mfaPendingSecret only — mfaSecret is written in verify-setup
    // after the user proves possession of the device (F5 audit fix).
    // 15-minute window is enough to scan a QR code and enter a code.
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          mfaPendingSecret: setup.base32,
          mfaPendingSecretExpires: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
    );

    res.json({
      success: true,
      data: {
        qrCodeDataUrl: setup.qrCodeDataUrl,
        otpauthUrl: setup.otpauthUrl,
        // base32 returned for authenticator apps that cannot scan QR codes.
        secretBase32: setup.base32,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/mfa/verify-setup
 *
 * Step 2 of enrollment. Body: { code }. If the code matches the stored
 * mfaSecret, mfaEnabled flips true and 8 backup codes are returned ONCE.
 */
const mfaVerifySetup = async (req, res) => {
  try {
    const mfaService = require('../services/mfaService');
    const User = require('../models/User');
    const { code } = req.body;

    const user = await User.findById(req.user._id)
      .select('+mfaPendingSecret +mfaPendingSecretExpires');
    if (!user || !user.mfaPendingSecret) {
      return res.status(400).json({
        success: false,
        message: 'No pending MFA setup. Call /mfa/setup first.',
      });
    }

    if (user.mfaPendingSecretExpires < new Date()) {
      await User.updateOne(
        { _id: user._id },
        { $set: { mfaPendingSecret: null, mfaPendingSecretExpires: null } },
      );
      return res.status(400).json({
        success: false,
        message: 'MFA setup expired. Call /mfa/setup again.',
      });
    }

    if (!mfaService.verifyToken(user.mfaPendingSecret, code)) {
      return res.status(401).json({ success: false, message: 'Invalid code' });
    }

    // User proved possession — promote pending secret to permanent and enable MFA.
    const { plain, hashed } = await mfaService.generateBackupCodes();
    user.mfaSecret = user.mfaPendingSecret;
    user.mfaPendingSecret = null;
    user.mfaPendingSecretExpires = null;
    user.mfaEnabled = true;
    user.mfaBackupCodes = hashed;
    await user.save();

    // Bust the auth-middleware user cache so the next /auth/me reflects
    // mfaEnabled=true immediately (otherwise the SPA reads a stale
    // mfaEnabled=false for up to the cache TTL).
    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'mfa-enabled',
      entity: 'User',
      entityId: user._id,
      note: req.mfaEnrollmentRequired ? 'Forced enrollment completed' : undefined,
    });

    // If enrollment was triggered by MFA enforcement (the user came in
    // via an enrollment-required token), swap their cookie for a full
    // session token now — they shouldn't have to log in again after
    // completing the very flow we just forced them through.
    // Revoke the enrollment token first so it cannot be reused (F3 audit fix).
    if (req.mfaEnrollmentRequired) {
      if (req.tokenJti && req.tokenExp) {
        await authService.revokeToken(req.tokenJti, req.tokenExp, {
          userId: user._id,
          reason: 'mfa-upgrade',
        });
      }
      const fullToken = authService.generateToken(user._id);
      res.cookie('tms_token', fullToken, authService.getCookieOptions());
    }

    res.json({
      success: true,
      message: 'MFA enabled. Save these backup codes — they will not be shown again.',
      data: {
        backupCodes: plain,
        sessionUpgraded: !!req.mfaEnrollmentRequired,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/mfa/disable
 *
 * Body: { code }. Self-service disable. Requires a valid TOTP/backup code
 * to prove the device is still in the user's possession (otherwise an
 * attacker who steals a session cookie could turn off MFA silently).
 */
const mfaDisable = async (req, res) => {
  try {
    const mfaService = require('../services/mfaService');
    const User = require('../models/User');
    const { code } = req.body;

    const user = await User.findById(req.user._id).select('+mfaSecret +mfaBackupCodes');
    if (!user || !user.mfaEnabled) {
      return res.status(400).json({ success: false, message: 'MFA is not enabled' });
    }

    let ok = mfaService.verifyToken(user.mfaSecret, code);
    if (!ok) {
      const remaining = await mfaService.consumeBackupCode(user.mfaBackupCodes || [], code);
      if (remaining) ok = true;
    }
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid code' });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = [];
    await user.save();

    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'mfa-disabled',
      entity: 'User',
      entityId: user._id,
    });

    res.json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/mfa/admin-disable/:userId
 *
 * Admin override. Used when a user has lost their device. Does NOT
 * require a code — the admin's own session is the authorization.
 * Audit-logged with the admin as actor and the target user as entity.
 */
const mfaAdminDisable = async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = [];
    await user.save();

    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'mfa-admin-disabled',
      entity: 'User',
      entityId: user._id,
      note: `MFA reset by admin for ${user.empCode}`,
    });

    res.json({ success: true, message: `MFA disabled for ${user.empCode}` });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  // Revoke the current token by adding its JTI to the blocklist so it
  // can't be reused even if the cookie is stolen post-logout.
  if (req.tokenJti && req.tokenExp) {
    try {
      await authService.revokeToken(req.tokenJti, req.tokenExp, {
        userId: req.user?._id,
        reason: 'logout',
      });
    } catch (err) {
      // Revocation is best-effort. Log but don't block the user.
      const log = req.log || require('../lib/logger');
      log.warn({ err: err.message, jti: req.tokenJti }, 'Token revocation failed on logout');
    }
  }

  // Include all attributes that were set when the cookie was created so
  // the browser matches and actually removes it (#6 fix: was missing
  // httpOnly / secure / sameSite, which caused some browsers to ignore
  // the clear directive).
  res.clearCookie('tms_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
  });
  rotateCsrfToken(res); // Issue a fresh CSRF token for the logged-out state (#7)

  auditService.record({
    req,
    action: 'logged-out',
    entity: 'Auth',
    entityId: req.user?._id,
  });

  res.json({ success: true, message: 'Logged out' });
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  // Strip internal fields before sending to client.
  const { passwordChangedAt, ...safeUser } = req.user;
  // If the current session is an enrollment-required token (set by
  // the auth middleware when MFA enforcement applies), surface that
  // flag so the SPA keeps the user locked into the setup flow even
  // across reloads.
  if (req.mfaEnrollmentRequired) {
    safeUser.mfaEnrollmentRequired = true;
  }
  res.json({ success: true, data: safeUser });
};
/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false; // Clear forced-change flag (SEC-04)
    await user.save();
    // Invalidate auth cache — forces re-read with new passwordChangedAt on next request.
    // This also immediately rejects the current token (iat < changedAt).
    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'password-changed',
      entity: 'User',
      entityId: user._id,
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/admin/force-logout/:userId
 *
 * Admin-only kill switch. Invalidates ALL active tokens for the target
 * user by bumping passwordChangedAt — the existing auth middleware
 * already rejects tokens whose `iat < passwordChangedAt`. This is more
 * complete than per-JTI revocation since it catches tokens we don't know
 * about (e.g. issued before the blocklist existed).
 */
const adminForceLogout = async (req, res) => {
  try {
    const User = require('../models/User');
    const { userId } = req.params;
    const user = await User.findById(userId).select('_id empCode role');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.updateOne(
      { _id: userId },
      { $set: { passwordChangedAt: new Date() } }
    );

    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'force-logged-out',
      entity: 'User',
      entityId: user._id,
      note: `Admin force-logout of ${user.empCode}`,
    });

    res.json({ success: true, message: `All sessions for ${user.empCode} invalidated` });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/forgot-password
 * Body: { empCode }
 * Generates a reset token, stores its hash on the user, emails the raw token.
 * Always returns 200 to avoid user-enumeration (don't reveal if empCode exists).
 */
// SEC-008: hash empCode before logging so ops can correlate per-attacker
// activity without storing the raw empCode in log aggregators. Short hash
// is sufficient — collisions only need to be rare across a single rate-limit
// window (~5 attempts / 15 min per IP).
const hashEmpCodeForLog = (empCode) =>
  crypto.createHash('sha256').update(String(empCode || '')).digest('hex').slice(0, 12);

const forgotPassword = async (req, res) => {
  // BUG #15 fix: previously a real user took ~hundreds of ms (DB save +
  // bcrypt-equivalent crypto + SMTP roundtrip) while a non-existent user
  // returned 200 in ~10ms. The timing differential let an attacker
  // enumerate valid empCodes despite the unified response message.
  //
  // We now:
  //   1. Reply 200 IMMEDIATELY (constant-time from the attacker's view).
  //   2. Do the real work (token mint, DB save, email send) AFTER the
  //      response is flushed, off the request thread.
  // The trade-off: a legitimate user whose email send fails sees no
  // error — but `loginLimiter` already caps abuse to 5/15min and email
  // failures are logged for ops follow-up. The anti-enumeration property
  // is more valuable than the inline error reporting here.

  const okMsg = 'If that employee code exists and has an email on file, a reset link has been sent.';

  const { empCode } = req.body || {};
  if (!empCode || typeof empCode !== 'string' || empCode.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'empCode is required' });
  }
  const normalizedEmpCode = empCode.trim();

  // Reply first — same shape for valid and invalid users.
  res.json({ success: true, message: okMsg });

  // Background work — best-effort, never blocks or surfaces errors to the caller.
  // We intentionally do NOT await this from the request handler.
  // Q1 fix: wrap the async IIFE with .catch() so that even if logger.warn
  // itself throws inside the outer catch, the rejected Promise is still
  // handled and cannot crash the process via unhandledRejection.
  setImmediate(() => {
    (async () => {
      try {
        const User = require('../models/User');
        const user = await User.findOne({ empCode: normalizedEmpCode, isDeleted: { $ne: true } });
        if (!user || !user.email) {
          // SEC-008: do NOT log raw empCode. Use a short SHA-256 prefix so
          // ops can correlate without enabling enumeration via log aggregator.
          logger.info({ empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Forgot-password: completed background flow');
          return;
        }

        // Q2: per-user 5-minute cooldown — prevents an attacker from spamming
        // the endpoint to keep overwriting the victim's valid token, which would
        // lock them out of self-service password reset for up to 1 hour.
        const COOLDOWN_MS = 5 * 60 * 1000;
        if (
          user.passwordResetToken &&
          user.passwordResetExpires > new Date(Date.now() + 60 * 60 * 1000 - COOLDOWN_MS)
        ) {
          // SEC-008: same identical message text for the cooldown branch —
          // attackers cannot distinguish "user does not exist" from "user
          // exists but cooled down" via log content.
          logger.info({ empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Forgot-password: completed background flow');
          return;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = expires;
        await user.save({ validateBeforeSave: false });

        const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
        // SEC-005: token in URL PATH (not query string) — reduces leak via
        // access-log query-string fields and shared-bookmark accidents.
        // The token is still single-use + 1h expiry; combined with
        // Referrer-Policy: no-referrer (server.js:103) and the page's
        // POST-form pattern, the leak surface is materially reduced.
        const resetUrl = `${clientOrigin}/reset-password/${rawToken}`;

        try {
          await sendMail({
            to: user.email,
            subject: 'TMS — Password Reset Request',
            text: `Hi ${user.name},\n\nYou requested a password reset. Click the link below (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
            html: `<p>Hi <strong>${user.name}</strong>,</p>` +
                  `<p>You requested a password reset. Click the link below (valid for 1 hour):</p>` +
                  `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
                  `<p>If you did not request this, ignore this email.</p>`,
          });
          // SEC-008: log only the empCode hash; same message text as the
          // not-found / cooldown branches so log content does not enumerate.
          logger.info({ empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Forgot-password: completed background flow');
        } catch (mailErr) {
          // Roll back the token so the user can retry without ambiguity.
          user.passwordResetToken = null;
          user.passwordResetExpires = null;
          await user.save({ validateBeforeSave: false });
          logger.warn({ err: mailErr, empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Password reset email failed');
        }
      } catch (err) {
        logger.warn({ err, empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Forgot-password background flow errored');
      }
    })().catch((err) => {
      // Safety net — only reachable if logger.warn itself threw inside the catch above.
      console.error('[forgot-password] unhandled background error', err?.message || err); // eslint-disable-line no-console
    });
  });
};

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 * Verifies the token (hash match + expiry), sets the new password.
 */
const resetPassword = async (req, res) => {
  try {
    // SEC-005: token may arrive either:
    //   - in body (legacy clients, posted from /reset-password?token=...)
    //   - in URL params (current clients, posted from /reset-password/:token)
    // We accept both to maintain a graceful transition window (1 hour) for
    // emails sent before this code shipped.
    const token = (req.params && req.params.token) || (req.body && req.body.token);
    const { password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'token and password are required' });
    }
    if (password.length < 10) {
      return res.status(400).json({ success: false, message: 'Password must be at least 10 characters' });
    }

    const User = require('../models/User');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Hash password before the atomic update — findOneAndUpdate does not
    // trigger pre-save hooks, so bcrypt must run here (F4 audit fix).
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Atomic find-and-clear: first concurrent request nulls the token;
    // any subsequent request finds no matching document → 400.
    // Prevents double-spend race condition.
    const user = await User.findOneAndUpdate(
      {
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: new Date() },
        isDeleted: { $ne: true },
      },
      {
        $set: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
          passwordChangedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired' });
    }

    // Invalidate any cached user state
    const { invalidateUserCache } = require('../middleware/auth');
    if (typeof invalidateUserCache === 'function') {
      invalidateUserCache(user._id);
    }

    logger.info({ userId: user._id }, 'Password reset successful');
    res.json({ success: true, message: 'Password reset successful. Please sign in with your new password.' });
  } catch (err) {
    handleError(res, err);
  }
};

module.exports = {
  login,
  logout,
  getMe,
  changePassword,
  adminForceLogout,
  mfaVerifyLogin,
  mfaSetup,
  mfaVerifySetup,
  mfaDisable,
  mfaAdminDisable,
  forgotPassword,
  resetPassword,
};
