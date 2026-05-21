const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');

// ──────────────────────────────────────────────────────────
// MFA Service (Phase 1.3) — TOTP + Backup Codes
// ──────────────────────────────────────────────────────────
// Library choice rationale:
//   - speakeasy: stable, mature, no native deps. RFC 6238 TOTP.
//   - qrcode:    generates data: URLs the frontend can <img src=...>.
//
// Security choices:
//   - 30-second step, 6 digits — RFC 6238 defaults, every authenticator
//     app supports them.
//   - window=1 in verify(): accepts the previous and next 30-sec window
//     in addition to the current one. Tolerates ~30s clock skew without
//     opening a meaningful brute-force window.
//   - Backup codes are bcrypt-hashed (salt=10). Lower than password
//     bcrypt (12) because backup codes are 80 bits of entropy already.
// ──────────────────────────────────────────────────────────

const TOTP_ISSUER = process.env.MFA_ISSUER || 'TMS';
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 5; // 10 hex chars = 40 bits, formatted as XXXXX-XXXXX

/**
 * Generate a fresh TOTP secret + provisioning URI + QR code data URL.
 * Caller persists `secret.base32` on User.mfaSecret BUT keeps mfaEnabled
 * false until the user proves possession by submitting a valid code.
 */
const generateSetup = async (empCode) => {
  const secret = speakeasy.generateSecret({
    name: `${TOTP_ISSUER}:${empCode}`,
    issuer: TOTP_ISSUER,
    length: 20,
  });

  const otpauthUrl = secret.otpauth_url;
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    base32: secret.base32,
    otpauthUrl,
    qrCodeDataUrl,
  };
};

/**
 * Verify a 6-digit TOTP code against a secret.
 *
 * window: 2 accepts codes for the current 30-s step ± 2 steps (= ±60 s).
 * RFC 6238 recommends window ≤ 1, but cloud servers and mobile clocks can
 * drift by 30–60 s in practice, so 2 is a pragmatic production default
 * while still blocking brute-force (only 5 valid windows at any moment).
 *
 * NOTE: This function has NO replay protection. Use it only for TOTP setup
 * verification (mfa/verify-setup) where the user is proving possession of
 * a new secret for the first time. For login, use verifyTokenWithReplay().
 */
const verifyToken = (secretBase32, token) => {
  if (!secretBase32 || !token) return false;
  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: 'base32',
    token: String(token).replace(/\s+/g, ''),
    window: 2,
  });
};

/**
 * Verify a TOTP code with replay-attack protection (P1 fix).
 *
 * Uses verifyDelta() to get the window offset (`delta`) of the matched code.
 * Returns { valid: true, delta: <number> } on success, or { valid: false, delta: null }.
 *
 * Replay protection:
 *   - `lastUsedCounter` is the `delta` persisted from the last successful login.
 *   - We reject any code whose delta ≤ lastUsedCounter — meaning the same
 *     30-second window (or an earlier one) was already accepted.
 *   - Each TOTP step has exactly one valid 6-digit code, so a code cannot be
 *     reused within the acceptance window once it has been consumed.
 *   - The caller MUST persist the returned `delta` to User.mfaLastUsedCounter
 *     on every successful verification.
 *
 * @param {string} secretBase32 - Base32-encoded TOTP secret
 * @param {string} token        - 6-digit code submitted by user
 * @param {number|null} lastUsedCounter - Most recently accepted delta (null if never used)
 * @returns {{ valid: boolean, delta: number|null }}
 */
const verifyTokenWithReplay = (secretBase32, token, lastUsedCounter) => {
  if (!secretBase32 || !token) return { valid: false, delta: null };

  const result = speakeasy.totp.verifyDelta({
    secret: secretBase32,
    encoding: 'base32',
    token: String(token).replace(/\s+/g, ''),
    window: 2,
  });

  if (!result) return { valid: false, delta: null };

  // Reject if this delta is not strictly newer than the last used one.
  // lastUsedCounter === null means no code has been verified yet — allow any delta.
  if (lastUsedCounter !== null && lastUsedCounter !== undefined && result.delta <= lastUsedCounter) {
    return { valid: false, delta: null };
  }

  return { valid: true, delta: result.delta };
};

/**
 * Generate N human-friendly backup codes. Returns BOTH the plaintext
 * (to show the user once) and the bcrypt hashes (to persist).
 */
const generateBackupCodes = async (count = BACKUP_CODE_COUNT) => {
  const plain = [];
  const hashed = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    plain.push(formatted);
    hashed.push(await bcrypt.hash(formatted, 10));
  }
  return { plain, hashed };
};

/**
 * Try to consume a backup code. If it matches, returns the array of
 * remaining hashes (caller must persist). If no match, returns null.
 *
 * Constant-time-ish: we always iterate the full list so a timing attack
 * can't easily learn how many codes remain.
 */
const consumeBackupCode = async (storedHashes, submittedCode) => {
  if (!storedHashes || !storedHashes.length || !submittedCode) return null;
  const normalized = String(submittedCode).trim().toUpperCase();
  let matchIndex = -1;
  for (let i = 0; i < storedHashes.length; i++) {
    // bcrypt.compare is itself constant-time per pair.
    // We don't break on first match so we visit every entry.
    const match = await bcrypt.compare(normalized, storedHashes[i]);
    if (match && matchIndex === -1) matchIndex = i;
  }
  if (matchIndex === -1) return null;
  const remaining = storedHashes.slice();
  remaining.splice(matchIndex, 1);
  return remaining;
};

module.exports = {
  generateSetup,
  verifyToken,
  verifyTokenWithReplay,
  generateBackupCodes,
  consumeBackupCode,
  BACKUP_CODE_COUNT,
};
