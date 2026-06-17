const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const { CAPABILITIES } = require('../../policy/capabilities');
const controller = require('./controller');
const { createBody, updateBody, listQuery, reorderBody } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Custom fields (Studio ▸ Custom fields) — mounted at /api/custom-fields.
// Admin-only config surface (settings.manage). Defines the extra fields an org
// can attach to an entity (phase 1: Program). Values live on the target doc.
// ──────────────────────────────────────────────────────────

router.use(protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE));

router
  .route('/')
  .get(validate({ query: listQuery }), controller.list)
  .post(validate({ body: createBody }), controller.create);

// Bulk drag-reorder — registered before '/:id' so "reorder" isn't read as an id.
router.put('/reorder', validate({ body: reorderBody }), controller.reorder);

router
  .route('/:id')
  .put(validate({ params: idParam, body: updateBody }), controller.update)
  .delete(validate({ params: idParam }), controller.archive);

module.exports = router;
