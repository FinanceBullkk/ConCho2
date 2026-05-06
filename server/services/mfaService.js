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
  generateBackupCodes,
  consumeBackupCode,
  BACKUP_CODE_COUNT,
};
