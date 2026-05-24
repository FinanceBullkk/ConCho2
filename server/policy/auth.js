/**
 * ──────────────────────────────────────────────────────────
 * server/policy/auth.js (audit PR 7 — SEC-009)
 * ──────────────────────────────────────────────────────────
 * Re-auth gate shared by cross-user sensitive auth operations:
 *   - POST /api/auth/admin/force-logout/:userId
 *   - POST /api/auth/mfa/admin-disable/:userId
 *
 * Same shape and contract as userController.updateUser uses for
 * cross-user password / role changes — the admin must re-enter their
 * OWN password in `req.body.currentPassword` before the destructive
 * action proceeds. A compromised admin SESSION (without the password)
 * cannot use this to silently disable MFA or boot a victim out.
 *
 * Pure async function returning { allowed, status, message }. The
 * controller handles HTTP — keeps this layer testable in isolation.
 */

const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * Verify the actor (admin) supplied their own current password in the
 * request body. Returns { allowed: true } on success; otherwise a
 * { allowed: false, status, message } pair the controller can echo.
 *
 * @param {Object} req — Express request, expected to carry req.user
 *                       (admin) + req.body.currentPassword (string).
 */
const requireReauth = async (req) => {
  const { currentPassword } = req.body || {};
  if (!currentPassword || typeof currentPassword !== 'string') {
    return {
      allowed: false,
      status: 403,
      message: 'currentPassword is required for this sensitive operation',
      reason: 'reauth-missing',
    };
  }

  // Re-read the actor with +password so bcrypt has the hash.
  const fresh = await User.findById(req.user._id).select('+password');
  if (!fresh) {
    return { allowed: false, status: 401, message: 'Actor not found', reason: 'no-actor' };
  }

  const ok = await bcrypt.compare(currentPassword, fresh.password);
  if (!ok) {
    return {
      allowed: false,
      status: 403,
      message: 'currentPassword is incorrect',
      reason: 'reauth-failed',
    };
  }

  return { allowed: true };
};

module.exports = { requireReauth };
