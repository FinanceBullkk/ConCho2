const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const { sendMail } = require('../../lib/mailer');
const logger = require('../../lib/logger');
// CODE-017: hoisted from per-handler lazy requires (legacy-cycle relic).
const authRepository = require('../../services/auth/auth-repository');
const { invalidateUserCache } = require('../../middleware/auth');

// ──────────────────────────────────────────────────────────
// Auth Controller — password reset (forgot / reset)
// ──────────────────────────────────────────────────────────
// Split from the legacy authController (Phase 1 modular-monolith).
// Anti-enumeration forgot-password (constant-time reply + background work)
// and single-use token reset.

// SEC-008: hash empCode before logging so ops can correlate per-attacker
// activity without storing the raw empCode in log aggregators. Short hash
// is sufficient — collisions only need to be rare across a single rate-limit
// window (~5 attempts / 15 min per IP).
const hashEmpCodeForLog = (empCode) =>
  crypto.createHash('sha256').update(String(empCode || '')).digest('hex').slice(0, 12);

/**
 * POST /api/auth/forgot-password
 * Body: { empCode }
 * Generates a reset token, stores its hash on the user, emails the raw token.
 * Always returns 200 to avoid user-enumeration (don't reveal if empCode exists).
 */
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
        const user = await authRepository.findForPasswordReset(normalizedEmpCode);
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

        await authRepository.savePasswordResetToken(user._id, hashedToken, expires);

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
          await authRepository.clearPasswordResetToken(user._id);
          logger.warn({ err: mailErr, empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Password reset email failed');
        }
      } catch (err) {
        // OPS-014: a DB failure here (user lookup, token persist, rollback
        // save) silently corrupts the reset flow AFTER the caller already
        // got a 200 — promote to `error` so ops alerting sees it. The
        // email-send failure above stays `warn` (retry-able, token rolled back).
        logger.error({ err, empCodeHash: hashEmpCodeForLog(normalizedEmpCode) }, 'Forgot-password background flow errored');
      }
    })().catch((err) => {
      // Safety net — only reachable if logger.error itself threw inside the catch above.
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

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Hash password before the atomic update — findOneAndUpdate does not
    // trigger pre-save hooks, so bcrypt must run here (F4 audit fix).
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Atomic find-and-clear: first concurrent request nulls the token;
    // any subsequent request finds no matching document → 400.
    // Prevents double-spend race condition.
    const user = await authRepository.consumePasswordResetToken(hashedToken, hashedPassword);

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired' });
    }

    // Invalidate any cached user state
    if (typeof invalidateUserCache === 'function') {
      invalidateUserCache(user._id);
    }

    // Audit PR L (SEC-013): password reset is a credential-changing event;
    // record it even though the "actor" is unauthenticated (only the holder
    // of the emailed token can complete this path). We pass `req` without a
    // user; auditService will record actorRole='System' and capture IP/UA.
    auditService.record({
      req,
      action: 'password-reset-completed',
      entity: 'Auth',
      entityId: user._id,
      note: `empCode=${user.empCode}`,
    });

    logger.info({ userId: user._id }, 'Password reset successful');
    res.json({ success: true, message: 'Password reset successful. Please sign in with your new password.' });
  } catch (err) {
    handleError(res, err);
  }
};

module.exports = { forgotPassword, resetPassword };
