const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const {
  createVendorBody, updateVendorBody, ratingBody, listVendorsQuery, spendQuery,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// Vendor routes (A2, Horizon 2) — mounted at /api/vendors.
// BOTH read and write require vendor.manage (Admin + Coordinator): the vendor
// catalog carries contracts + spend, so it is a management surface (it does NOT
// roll into the broader report.read Teachers hold), mirroring budget.manage.
// Every mutation is audited. The more-specific /:id/spend + /:id/ratings routes
// sit after the bare /:id GET but use distinct verbs/paths, so no shadowing.
// ──────────────────────────────────────────────────────────

router.use(protect);

const manage = requireCapability('vendor.manage');

router.get('/', manage, validate({ query: listVendorsQuery }), controller.listVendors);
router.post('/', manage, validate({ body: createVendorBody }), controller.createVendor);
router.get('/:id', manage, validate({ params: idParam }), controller.getVendor);
router.put('/:id', manage, validate({ params: idParam, body: updateVendorBody }), controller.updateVendor);
router.delete('/:id', manage, validate({ params: idParam }), controller.archiveVendor);
router.get('/:id/spend', manage, validate({ params: idParam, query: spendQuery }), controller.getSpend);
router.post('/:id/ratings', manage, validate({ params: idParam, body: ratingBody }), controller.addRating);

module.exports = router;
