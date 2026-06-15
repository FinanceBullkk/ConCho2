const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const { CAPABILITIES } = require('../../policy/capabilities');
const controller = require('./controller');
const { createBody, updateBody } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Automation rules — Studio ▸ Automation (TMS.update gap #3). No-code
// when→if→then rules executed by the event-bus runner. `automation.manage`
// (Admin). Every write is audited; the runner reads rules live (no cache).
// ──────────────────────────────────────────────────────────
router.use(protect, requireCapability(CAPABILITIES.AUTOMATION_MANAGE));

router.get('/rules', controller.listRules);
router.post('/rules', validate({ body: createBody }), controller.createRule);
router.put('/rules/:id', validate({ params: idParam, body: updateBody }), controller.updateRule);
router.delete('/rules/:id', validate({ params: idParam }), controller.deleteRule);

module.exports = router;
