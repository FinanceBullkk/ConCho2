const webpush = require('web-push');
const logger = require('../lib/logger');
const PushSubscription = require('../models/PushSubscription');

// ──────────────────────────────────────────────────────────
// pushService — Web Push delivery for B5 (mobile learning surface, Horizon 2).
// ──────────────────────────────────────────────────────────
// Sends notifications to a user's registered devices via the `web-push` library.
// FAIL-SOFT by design (mirrors calendar/email integrations): when the VAPID env
// keys are absent it is a no-op + a one-time log — subscribe + the mobile feed
// still work; only delivery is dormant until the owner sets the keys. A push
// rejected 404/410 (subscription gone) prunes that row so the table self-heals.
//
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… or a URL).
// Generate a keypair with:  npx web-push generate-vapid-keys
// ──────────────────────────────────────────────────────────

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@tms.local';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (e) {
    logger.warn({ err: e?.message }, 'pushService: invalid VAPID keys — Web Push disabled');
  }
} else {
  logger.warn('pushService: VAPID keys not set — Web Push disabled (subscribe + feed still work)');
}

const isConfigured = () => configured;
const getPublicKey = () => (configured ? PUBLIC_KEY : null);

/**
 * Send a notification to every device a user has registered. Never throws.
 * @param {string|ObjectId} userId
 * @param {{title:string, body?:string, url?:string, tag?:string}} payload
 * @returns {Promise<{sent:number, pruned:number}>}
 */
const sendToUser = async (userId, payload = {}) => {
  if (!configured || !userId) return { sent: 0, pruned: 0 };
  let subs = [];
  try {
    subs = await PushSubscription.find({ userId }).lean();
  } catch {
    return { sent: 0, pruned: 0 };
  }
  if (!subs.length) return { sent: 0, pruned: 0 };

  const data = JSON.stringify({
    title: payload.title || 'TMS',
    body: payload.body || '',
    url: payload.url || '/me/today',
    tag: payload.tag || 'tms',
  });

  let sent = 0;
  const dead = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);
      sent += 1;
    } catch (err) {
      // 404/410 = the subscription no longer exists → prune it.
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint);
    }
  }));

  if (dead.length) {
    try { await PushSubscription.deleteMany({ endpoint: { $in: dead } }); } catch { /* best-effort */ }
  }
  return { sent, pruned: dead.length };
};

module.exports = { isConfigured, getPublicKey, sendToUser };
