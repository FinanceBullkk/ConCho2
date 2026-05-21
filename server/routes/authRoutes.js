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
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { loginLimiter, changePasswordLimiter, mfaLimiter, mfaVerifyLimiter, forgotPasswordLimiter } = require('../middleware/rateLimiters');
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

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with employee code and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [empCode, password]
 *             properties:
 *               empCode:  { type: string, example: '000001' }
 *               password: { type: string, example: 'mypassword' }
 *     responses:
 *       200:
 *         description: Login successful — session cookie set
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429:
 *         description: Too many failed attempts
 */
router.post('/login', loginLimiter, validate({ body: loginBody }), login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', changePasswordLimiter, protect, validate({ body: changePasswordBody }), changePassword);

// Admin kill-switch: invalidate every session for a target user.
router.post('/admin/force-logout/:userId', protect, roleGuard('Admin'), adminForceLogout);

// ── MFA / TOTP (Phase 1.3) ────────────────────────────────
// Login second-factor.
// mfaVerifyLimiter keys on the userId in the mfaPendingToken body field
// (5 failures / 15 min per user). mfaLimiter provides a broader IP-level
// backstop across all MFA endpoints.
router.post(
  '/mfa/verify',
  mfaLimiter,
  mfaVerifyLimiter,
  validate({ body: mfaVerifyLoginBody }),
  mfaVerifyLogin
);

// Self-service enrollment. `protect` ensures only the logged-in user
// can enroll their own device; the MFA-pending guard in protect()
// prevents this from being abused by a half-authenticated session.
router.post('/mfa/setup', mfaLimiter, protect, mfaSetup);
router.post('/mfa/verify-setup', mfaLimiter, protect, validate({ body: mfaCodeBody }), mfaVerifySetup);
router.post('/mfa/disable', mfaLimiter, protect, validate({ body: mfaCodeBody }), mfaDisable);

// Admin override: reset MFA when a user has lost their device.
router.post(
  '/mfa/admin-disable/:userId',
  mfaLimiter,
  protect,
  roleGuard('Admin'),
  mfaAdminDisable
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [empCode]
 *             properties:
 *               empCode: { type: string, example: '000001' }
 *     responses:
 *       200:
 *         description: Always 200 (anti-enumeration) — reset email sent if account found
 */
// POST /forgot-password — rate limited, no auth required
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using token from email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:    { type: string, description: Raw token from reset email }
 *               password: { type: string, minLength: 10 }
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
// POST /reset-password — rate limited, no auth required
router.post('/reset-password', forgotPasswordLimiter, resetPassword);

module.exports = router;

