const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const {
  createDepartmentBody,
  updateDepartmentBody,
  listDepartmentsQuery,
  assignUserBody,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// Org routes (Wave D3) — mounted at /api/org.
// Departments (Admin-managed) + manager/department assignment +
// the self-scoped manager dashboard.
// ──────────────────────────────────────────────────────────

router.use(protect);

// ── Manager dashboard — any role; returns ONLY the caller's reports ──
router.get('/my-team', requireCapability('team.read'), controller.getMyTeam);

// ── Departments ───────────────────────────────────────────
router
  .route('/departments')
  .get(requireCapability('department.read'), validate({ query: listDepartmentsQuery }), controller.listDepartments)
  .post(requireCapability('department.manage'), validate({ body: createDepartmentBody }), controller.createDepartment);

router
  .route('/departments/:id')
  .put(requireCapability('department.manage'), validate({ params: idParam, body: updateDepartmentBody }), controller.updateDepartment)
  .delete(requireCapability('department.manage'), validate({ params: idParam }), controller.archiveDepartment);

// ── Manager / department assignment (Admin) ───────────────
router.put(
  '/users/:id/assignment',
  requireCapability('org.manage'),
  validate({ params: idParam, body: assignUserBody }),
  controller.assignUser,
);

module.exports = router;
