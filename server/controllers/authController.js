const authService = require('../services/authService');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

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

    // Two-step login: if MFA is enabled, return the pending token in
    // the JSON body (NOT a cookie) so the client can pass it back to
    // /api/auth/mfa/verify with the user's TOTP code.
    if (result.mfaRequired) {
      return res.json({
        success: true,
        data: {
          mfaRequired: true,
          mfaPendingToken: result.mfaPendingToken,
        },
      });
    }

    // MFA enforcement path: user role requires MFA but no enrollment yet.
    // Set the enrollment-required token AS the session cookie. The auth
    // middleware will only allow this token to hit MFA setup endpoints
    // until enrollment completes.
    if (result.mfaEnrollmentRequired) {
      res.cookie('tms_token', result.enrollmentToken, result.cookieOptions);
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
 * Second leg of MFA-protected login. Body: { mfaPendingToken, code }.
 * On success, sets the regular session cookie.
 */
const mfaVerifyLogin = async (req, res) => {
  try {
    const { mfaPendingToken, code } = req.body;
    const { token, user, cookieOptions, backupCodeUsed } =
      await authService.verifyMfaLogin(mfaPendingToken, code);

    res.cookie('tms_token', token, cookieOptions);

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

    // Persist the secret immediately (so verify-setup can read it) but
    // keep mfaEnabled=false. If the user abandons the flow, the secret
    // sits unused and is overwritten on the next setup attempt.
    await User.updateOne(
      { _id: req.user._id },
      { $set: { mfaSecret: setup.base32 } }
    );

    res.json({
      success: true,
      data: {
        qrCodeDataUrl: setup.qrCodeDataUrl,
        otpauthUrl: setup.otpauthUrl,
        // base32 is also returned so users with apps that can't scan
        // a QR code can manually enter the secret.
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

    const user = await User.findById(req.user._id).select('+mfaSecret');
    if (!user || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        message: 'No pending MFA setup. Call /mfa/setup first.',
      });
    }

    if (!mfaService.verifyToken(user.mfaSecret, code)) {
      return res.status(401).json({ success: false, message: 'Invalid code' });
    }

    const { plain, hashed } = await mfaService.generateBackupCodes();
    user.mfaEnabled = true;
    user.mfaBackupCodes = hashed;
    await user.save();

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
    if (req.mfaEnrollmentRequired) {
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

  res.clearCookie('tms_token', { path: '/' });

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
};
