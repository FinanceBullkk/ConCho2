const authService = require('../../services/authService');
const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const { rotateCsrfToken } = require('../../middleware/csrfProtection');
// CODE-017: hoisted from per-handler lazy requires (legacy-cycle relic).
const User = require('../../models/User');
const { invalidateUserCache } = require('../../middleware/auth');

// ──────────────────────────────────────────────────────────
// Auth Controller — session lifecycle
// ──────────────────────────────────────────────────────────
// Split from the legacy authController (Phase 1 modular-monolith).
// Login (incl. two-step MFA + forced-enrollment paths), MFA login verify,
// logout, current-user, and self-service password change.

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { empCode, password } = req.body;
    // Pass req so the service can write audit lines (lockout) with the
    // calling IP/UA — see audit PR L (SEC-013).
    const result = await authService.authenticate(empCode, password, req);

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
      await authService.verifyMfaLogin(mfaPendingToken, code, req);

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
      const log = req.log || require('../../lib/logger');
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

module.exports = { login, mfaVerifyLogin, logout, getMe, changePassword };
