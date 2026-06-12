// @ts-check
import crypto from 'node:crypto';

/**
 * Minimal RFC 6238 TOTP generator for E2E (QA-018b).
 *
 * The server verifies with speakeasy (30s step, 6 digits, SHA-1, window 1).
 * Playwright specs run in Node, so we generate codes locally from the
 * base32 secret returned by /api/auth/mfa/setup — no extra dependency.
 */

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode an RFC 4648 base32 string (no padding required) into a Buffer. */
export function base32Decode(input) {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Generate the 6-digit TOTP code for a base32 secret.
 * @param {string} secretBase32
 * @param {number} [timestampMs] — defaults to now; pass a future/past time to
 *   generate neighbouring-step codes.
 */
export function totp(secretBase32, timestampMs = Date.now()) {
  const counter = Math.floor(timestampMs / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', base32Decode(secretBase32)).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}
