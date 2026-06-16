const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const {
  upsertProfileBody, ratingBody, listTrainersQuery, loadQuery, userIdParam,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// Trainer routes (A6, Horizon 2) — mounted at /api/trainers.
// Reuses the existing session.assign-trainer capability (Admin + Coordinator) —
// trainer qualification/availability is the same management surface as naming a
// session's trainers. roleGuard belt keeps Teacher/Participant out cheaply, then
// the capability is the real gate (mirrors PUT /api/schedules/:id/trainers).
// Every mutation is audited.
// ──────────────────────────────────────────────────────────

router.use(protect, roleGuard('Admin', 'Coordinator'), requireCapability('session.assign-trainer'));

router.get('/', validate({ query: listTrainersQuery }), controller.listTrainers);
router.get('/:userId', validate({ params: userIdParam }), controller.getTrainer);
router.put('/:userId', validate({ params: userIdParam, body: upsertProfileBody }), controller.upsertProfile);
router.delete('/:userId', validate({ params: userIdParam }), controller.archiveProfile);
router.get('/:userId/load', validate({ params: userIdParam, query: loadQuery }), controller.getLoad);
router.post('/:userId/ratings', validate({ params: userIdParam, body: ratingBody }), controller.addRating);

module.exports = router;
