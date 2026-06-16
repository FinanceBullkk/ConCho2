const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const { subscribeBody, unsubscribeBody } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Mobile routes (B5, Horizon 2) — mounted at /api/me.
// Self-scoped learner surface — any authenticated user, scoped to req.user
// (no capability; like the notification feed). Web Push subscription + the
// "due today" mobile feed.
// ──────────────────────────────────────────────────────────

router.use(protect);

router.get('/push/vapid-key', controller.getVapidKey);
router.post('/push/subscribe', validate({ body: subscribeBody }), controller.subscribe);
router.delete('/push/subscribe', validate({ body: unsubscribeBody }), controller.unsubscribe);
router.get('/mobile-feed', controller.getFeed);

module.exports = router;
