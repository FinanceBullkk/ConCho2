const NotificationLog = require('../../models/NotificationLog');
const pushService = require('../../services/pushService');

// Fail-soft, idempotent in-app notification write for the bell (Cohesion P5+).
//
// The bell is a convenience read-surface over NotificationLog — a logging
// hiccup (or a duplicate) must NEVER block the business mutation that triggered
// it. So every error is swallowed:
//   - duplicate (E11000) → the caller-supplied `cadenceKey` already wrote a row
//     for this event (the model's unique compound index) → idempotent no-op.
//   - any transient DB error → the bell simply misses one row; the mutation
//     (certificate issue / enrollment / booking) still succeeds.
//
// `channel:'in_app'` rows have no email — they exist purely for the feed.
const recordInApp = async ({ type, recipientUserId, learnerId, cadenceKey, metadata = {} }) => {
  try {
    await NotificationLog.create({
      type,
      channel: 'in_app',
      recipientUserId,
      learnerId: learnerId || recipientUserId,
      cadenceKey,
      status: 'sent',
      sentAt: new Date(),
      metadata,
    });
    // B5 (Horizon 2) — ride-along Web Push to the recipient's devices. Fire-and-
    // forget + fail-soft (no-op when VAPID env unset): the bell row already
    // landed, so a push hiccup must never affect the triggering mutation.
    pushService.sendToUser(recipientUserId, {
      title: metadata.title || 'TMS',
      body: metadata.body || metadata.message || '',
      url: metadata.url || '/me/today',
      tag: type,
    }).catch(() => { /* best-effort */ });
  } catch (_e) { /* best-effort: duplicate (idempotent) or transient DB hiccup */ }
};

module.exports = { recordInApp };
