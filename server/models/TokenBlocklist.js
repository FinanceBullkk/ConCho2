const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// TokenBlocklist (Phase 1.4)
// ──────────────────────────────────────────────────────────
// Stores revoked JWT JTIs (JWT IDs) so the auth middleware can
// reject them even though they're still cryptographically valid.
//
// Why per-JTI not per-user:
//   passwordChangedAt already invalidates ALL tokens for a user.
//   This collection covers the more granular cases: explicit
//   logout, admin force-logout of one device, suspicious activity.
//
// Storage cost: each row is ~80 bytes. The TTL index auto-prunes
// once the underlying token would have expired anyway, so the
// collection is bounded by (logout rate * token TTL).
//
// Why Mongo and not Redis: avoids adding a runtime dependency for
// Phase 1. When Phase 3.1 swaps in Redis, this collection becomes
// a Redis key with TTL and the model can be dropped.
// ──────────────────────────────────────────────────────────

const tokenBlocklistSchema = new mongoose.Schema(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // The original token's `exp` claim. The TTL index uses this to
    // auto-purge the row once the token would have expired anyway.
    expiresAt: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      enum: ['logout', 'force-logout', 'password-change', 'admin-action'],
      default: 'logout',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Auto-prune expired blocklist entries.
tokenBlocklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenBlocklist', tokenBlocklistSchema);
