const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// PushSubscription (Modernization Horizon 2 — B5 mobile learning surface)
// ──────────────────────────────────────────────────────────
// One Web Push subscription per device/browser for a user. The browser's
// PushManager produces { endpoint, keys:{p256dh, auth} }; `pushService` sends to
// these via the `web-push` library. `endpoint` is globally unique (the push
// service's URL for that device) — re-subscribing upserts on it. These are
// disposable device records (NOT user/attendance/evaluation data), so a stale or
// rejected (404/410) subscription is hard-deleted, not soft-deleted.
// ──────────────────────────────────────────────────────────

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
