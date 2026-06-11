const authPolicy = require('../../policy/auth');
const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Auth Controller — admin overrides
// ──────────────────────────────────────────────────────────
// Split from the legacy authController (Phase 1 modular-monolith).
// Admin-initiated actions against ANOTHER user's account. Both require the
// admin to re-enter their OWN password (authPolicy.requireReauth, SEC-009)
// so a stolen admin session cookie alone cannot wield them.

/**
 * POST /api/auth/mfa/admin-disable/:userId
 *
 * Admin override. Used when a user has lost their device. Does NOT
 * require a code — the admin's own session is the authorization.
 * Audit-logged with the admin as actor and the target user as entity.
 */
const mfaAdminDisable = async (req, res) => {
  try {
    // Audit PR 7 (SEC-009): require the admin to re-enter their OWN
    // password. A stolen admin session cookie without the password
    // cannot use this to silently drop MFA from a victim account.
    const gate = await authPolicy.requireReauth(req);
    if (!gate.allowed) {
      return res.status(gate.status).json({
        success: false,
        message: gate.message,
        reason: gate.reason,
      });
    }

    const User = require('../../models/User');
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = [];
    await user.save();

    const { invalidateUserCache } = require('../../middleware/auth');
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
    // Audit PR 7 (SEC-009): require the admin to re-enter their OWN
    // password before killing all sessions of another user. Without
    // this gate, a stolen admin cookie could boot any user offline.
    const gate = await authPolicy.requireReauth(req);
    if (!gate.allowed) {
      return res.status(gate.status).json({
        success: false,
        message: gate.message,
        reason: gate.reason,
      });
    }

    const User = require('../../models/User');
    const { userId } = req.params;
    const user = await User.findById(userId).select('_id empCode role');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.updateOne(
      { _id: userId },
      { $set: { passwordChangedAt: new Date() } }
    );

    const { invalidateUserCache } = require('../../middleware/auth');
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

module.exports = { mfaAdminDisable, adminForceLogout };
