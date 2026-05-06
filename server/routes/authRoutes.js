const router = require('express').Router();
const { z } = require('zod');
const {
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
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiters');
const { loginBody } = require('../schemas/auth');

const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'New password must be at least 10 characters'),
});

// MFA validation. Codes are 6 digits or a backup of the form XXXXX-XXXXX.
const mfaCodeSchema = z.string().min(6).max(20);
const mfaVerifyLoginBody = z.object({
  mfaPendingToken: z.string().min(10),
  code: mfaCodeSchema,
});
const mfaCodeBody = z.object({ code: mfaCodeSchema });

router.post('/login', loginLimiter, validate({ body: loginBody }), login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, validate({ body: changePasswordBody }), changePassword);

// Admin kill-switch: invalidate every session for a target user.
router.post('/admin/force-logout/:userId', protect, roleGuard('Admin'), adminForceLogout);

// ── MFA / TOTP (Phase 1.3) ────────────────────────────────
// Login second-factor. Rate-limited identically to /login since each
// attempt is effectively a login attempt.
router.post(
  '/mfa/verify',
  loginLimiter,
  validate({ body: mfaVerifyLoginBody }),
  mfaVerifyLogin
);

// Self-service enrollment. `protect` ensures only the logged-in user
// can enroll their own device; the MFA-pending guard in protect()
// prevents this from being abused by a half-authenticated session.
router.post('/mfa/setup', protect, mfaSetup);
router.post('/mfa/verify-setup', protect, validate({ body: mfaCodeBody }), mfaVerifySetup);
router.post('/mfa/disable', protect, validate({ body: mfaCodeBody }), mfaDisable);

// Admin override: reset MFA when a user has lost their device.
router.post(
  '/mfa/admin-disable/:userId',
  protect,
  roleGuard('Admin'),
  mfaAdminDisable
);

module.exports = router;

