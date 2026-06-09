const authService = require('../../services/authService');
const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Auth Controller — self-service MFA enrollment/management
// ──────────────────────────────────────────────────────────
// Split from the legacy authController (Phase 1 modular-monolith).
// Setup (generate secret/QR), verify-setup (enable + backup codes), and
// self-disable (requires a valid code). Admin MFA reset lives in auth-admin.

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
    const mfaService = require('../../services/mfaService');
    const User = require('../../models/User');

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
    const mfaService = require('../../services/mfaService');
    const User = require('../../models/User');
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
    const { invalidateUserCache } = require('../../middleware/auth');
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
    const mfaService = require('../../services/mfaService');
    const User = require('../../models/User');
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

    const { invalidateUserCache } = require('../../middleware/auth');
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

module.exports = { mfaSetup, mfaVerifySetup, mfaDisable };
