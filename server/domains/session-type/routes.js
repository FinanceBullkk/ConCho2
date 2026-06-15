const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const { createSessionTypeBody, updateSessionTypeBody } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Session-type routes (Build Plan #5) — mounted at /api/session-types.
// Read is session.book (the booking flow lists types to prefill a session);
// create/edit/archive is room.manage (scheduling config — Admin/Coordinator).
// Types are metadata only — they never gate slot/room/conflict logic.
// ──────────────────────────────────────────────────────────

router.use(protect);

router
  .route('/')
  .get(requireCapability('session.book'), controller.listSessionTypes)
  .post(requireCapability('room.manage'), validate({ body: createSessionTypeBody }), controller.createSessionType);

router
  .route('/:id')
  .put(requireCapability('room.manage'), validate({ params: idParam, body: updateSessionTypeBody }), controller.updateSessionType)
  .delete(requireCapability('room.manage'), validate({ params: idParam }), controller.archiveSessionType);

module.exports = router;
