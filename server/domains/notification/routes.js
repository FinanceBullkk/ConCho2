const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const { preferencesBody } = require('./schemas');

// ──────────────────────────────────────────────────────────
// In-app notification bell (Cohesion P5) — mounted at /api/notifications.
// Read-feed over the existing email NotificationLog; every route is
// self-scoped to the caller. `notification.read` is held by ALL roles
// (the endpoints only ever expose the caller's own rows).
// ──────────────────────────────────────────────────────────

router.use(protect);

router.get('/mine', requireCapability('notification.read'), controller.listMine);
router.post('/read-all', requireCapability('notification.read'), controller.markAllRead);

// Self-scoped delivery preferences (per-category in-app/email + digest).
router.get('/preferences', requireCapability('notification.read'), controller.getPreferences);
router.put(
  '/preferences',
  requireCapability('notification.read'),
  validate({ body: preferencesBody }),
  controller.setPreferences,
);
router.post(
  '/:id/read',
  requireCapability('notification.read'),
  validate({ params: idParam }),
  controller.markRead,
);

module.exports = router;
