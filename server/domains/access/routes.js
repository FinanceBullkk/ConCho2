const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { CAPABILITIES } = require('../../policy/capabilities');
const controller = require('./controller');
const { createRoleBody, updateRoleBody, keyParam } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Access (Roles & capabilities) — Studio ▸ Roles & access (TMS.update gap #2).
// The matrix read stays Admin-only (settings.manage, back-compat). Editing
// grants + custom roles is `role.manage` (Admin holds it as superuser). Every
// write is audited and refreshes the in-memory grants store.
// ──────────────────────────────────────────────────────────
router.use(protect);

router.get('/capability-matrix', requireCapability(CAPABILITIES.SETTINGS_MANAGE), controller.getMatrix);

router.get('/roles', requireCapability(CAPABILITIES.ROLE_MANAGE), controller.listRoles);
router.post('/roles', requireCapability(CAPABILITIES.ROLE_MANAGE), validate({ body: createRoleBody }), controller.createRole);
router.put('/roles/:key', requireCapability(CAPABILITIES.ROLE_MANAGE), validate({ params: keyParam, body: updateRoleBody }), controller.updateRole);
router.delete('/roles/:key', requireCapability(CAPABILITIES.ROLE_MANAGE), validate({ params: keyParam }), controller.deleteRole);

module.exports = router;
