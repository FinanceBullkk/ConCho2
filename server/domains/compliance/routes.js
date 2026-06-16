const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const { createRequirementBody, updateRequirementBody, matrixQuery } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Compliance routes (A3, Horizon 1) — mounted at /api/compliance.
// Reading the matrix/requirements rolls into report.read; defining the rules
// needs compliance.manage (Admin + Coordinator). Mutations are audited and
// publish requirement.changed.
// ──────────────────────────────────────────────────────────

router.use(protect);

router.get('/requirements', requireCapability('report.read'), controller.listRequirements);
router.post('/requirements', requireCapability('compliance.manage'), validate({ body: createRequirementBody }), controller.createRequirement);
router.put('/requirements/:id', requireCapability('compliance.manage'), validate({ params: idParam, body: updateRequirementBody }), controller.updateRequirement);
router.delete('/requirements/:id', requireCapability('compliance.manage'), validate({ params: idParam }), controller.archiveRequirement);

router.get('/matrix', requireCapability('report.read'), validate({ query: matrixQuery }), controller.getMatrix);
router.get('/user/:id', requireCapability('report.read'), validate({ params: idParam }), controller.getUserCompliance);

module.exports = router;
