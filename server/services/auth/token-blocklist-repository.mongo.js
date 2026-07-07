const TokenBlocklist = require('../../models/TokenBlocklist');

// token-blocklist-repository — MONGO impl. The TokenBlocklist touches of
// auth-tokens.js, extracted verbatim so the Postgres twin swaps cleanly.
// Retention: the model's TTL index (expireAfterSeconds: 0 on expiresAt)
// auto-prunes expired rows — the PG twin leans on retentionPurgeJob instead.

/**
 * Record a revoked JTI. Upsert with $setOnInsert → a duplicate revocation
 * (e.g. double-logout-click) is a no-op that keeps the ORIGINAL row.
 * @param {string} jti
 * @param {{ userId?: string|null, expiresAt: Date, reason: string }} row
 */
const insertRevocation = async (jti, { userId, expiresAt, reason }) => {
  await TokenBlocklist.updateOne(
    { jti },
    { $setOnInsert: { jti, userId: userId || null, expiresAt, reason } },
    { upsert: true }
  );
};

/** Is this JTI revoked? Single indexed lookup — auth middleware hot path. */
const isJtiRevoked = async (jti) => {
  const hit = await TokenBlocklist.findOne({ jti }).select('_id').lean();
  return !!hit;
};

module.exports = { insertRevocation, isJtiRevoked };
