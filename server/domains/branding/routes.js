const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { CAPABILITIES } = require('../../policy/capabilities');
const controller = require('./controller');
const { updateBody } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Branding & templates designer (TMS.update gap #5). Singleton TenantConfig
// feeding the existing certificate + email pipeline. `branding.manage` (Admin).
// GET is Admin too (the designer surface); the server-side pipeline reads the
// cached config directly (lib/branding), not via HTTP.
// ──────────────────────────────────────────────────────────
router.use(protect, requireCapability(CAPABILITIES.BRANDING_MANAGE));

router.get('/', controller.getBranding);
router.put('/', validate({ body: updateBody }), controller.updateBranding);

module.exports = router;
