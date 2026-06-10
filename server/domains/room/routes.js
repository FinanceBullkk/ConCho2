const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const { createRoomBody, updateRoomBody, listRoomsQuery } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Room routes (re-center Phase 3) — mounted at /api/rooms.
// Office-scoped Rooms; CRUD is Admin + Coordinator (capability-gated, NOT
// roleGuard('Admin') — a coordinator runs scheduling without full Admin).
// Read is gated by room.read (Admin/Coordinator) — the room list/availability
// is a scheduling tool, never learner-facing.
// ──────────────────────────────────────────────────────────

router.use(protect);

router
  .route('/')
  .get(requireCapability('room.read'), validate({ query: listRoomsQuery }), controller.listRooms)
  .post(requireCapability('room.manage'), validate({ body: createRoomBody }), controller.createRoom);

router
  .route('/:id')
  .put(requireCapability('room.manage'), validate({ params: idParam, body: updateRoomBody }), controller.updateRoom)
  .delete(requireCapability('room.manage'), validate({ params: idParam }), controller.archiveRoom);

module.exports = router;
