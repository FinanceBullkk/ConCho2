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
 * window: 1 accepts the current 30-s step ± 1 step (= ±30 s clock skew).
 * RFC 6238 recommends window ≤ 1; this is the exact recommended value.
 * Most authenticator apps stay within ±5 s; ±30 s covers even sluggish
 * hardware clocks without opening a meaningful brute-force window.
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
    window: 1,
  });
};

// TOTP step (RFC 6238 default; speakeasy.totp uses 30 s and we keep the default).
const TOTP_STEP_SECONDS = 30;

/**
 * Verify a TOTP code with replay-attack protection.
 *
 * SEC-018 (audit round 3): the previous version persisted/compared the RELATIVE
 * `verifyDelta` offset (−1/0/+1). That offset is computed against the CURRENT
 * step every call, so a legitimately-current code is ALWAYS delta `0` regardless
 * of wall-clock time. With `lastUsedCounter=0` stored after the first login, the
 * next current-window code (also delta 0) hit `0 <= 0` and was FALSELY rejected
 * as a replay — i.e. TOTP login worked exactly once, then locked the user out.
 *
 * Fix: derive and compare the ABSOLUTE TOTP step counter
 * (`floor(now/step) + delta`). Each step has exactly one valid code, so:
 *   - a code from a step already consumed (counter ≤ lastUsedCounter) is a replay
 *     → rejected;
 *   - a code from a later step (counter > lastUsedCounter) is a fresh login
 *     → accepted.
 * The caller MUST persist the returned absolute `counter` to
 * User.mfaLastUsedCounter on every successful verification.
 *
 * @param {string} secretBase32 - Base32-encoded TOTP secret
 * @param {string} token        - 6-digit code submitted by user
 * @param {number|null} lastUsedCounter - Most recently accepted absolute step counter (null if never used)
 * @param {number} [nowSeconds]  - Override "now" (seconds since epoch) for deterministic tests
 * @returns {{ valid: boolean, counter: number|null }}
 */
const verifyTokenWithReplay = (secretBase32, token, lastUsedCounter, nowSeconds = Date.now() / 1000) => {
  if (!secretBase32 || !token) return { valid: false, counter: null };

  const result = speakeasy.totp.verifyDelta({
    secret: secretBase32,
    encoding: 'base32',
    token: String(token).replace(/\s+/g, ''),
    window: 1,
    time: nowSeconds,
  });

  if (!result) return { valid: false, counter: null };

  // Absolute step counter of the matched code (delta is relative to nowSeconds).
  const counter = Math.floor(nowSeconds / TOTP_STEP_SECONDS) + result.delta;

  // Reject any code from a step already consumed (or earlier).
  // lastUsedCounter null/undefined means no code has been verified yet.
  if (lastUsedCounter !== null && lastUsedCounter !== undefined && counter <= lastUsedCounter) {
    return { valid: false, counter: null };
  }

  return { valid: true, counter };
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
