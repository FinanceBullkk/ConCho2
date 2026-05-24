const { z } = require('zod');
const router = require('express').Router();
const {
  getEnrollments,
  getTeamEnrollments,
  getUserEnrollments,
  updateEnrollment,
  checkConflicts,
  transferEnrollment,
  bulkUpdateEnrollmentStatus,
  bulkTransferEnrollment,
} = require('../controllers/enrollmentController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { idParam, objectId } = require('../schemas/common');
const {
  listEnrollmentsQuery,
  updateEnrollmentBody,
  transferEnrollmentBody,
  checkConflictsBody,
  bulkStatusBody,
  bulkTransferBody,
} = require('../schemas/enrollment');

// All routes require authentication and Admin role
router.use(protect, roleGuard('Admin'));

// Audit PR E (SEC-011): every route now has a strict Zod schema —
// unknown fields are stripped + oversize bulk arrays rejected at 400.
router.get('/', validate({ query: listEnrollmentsQuery }), getEnrollments);
router.post('/check-conflicts', validate({ body: checkConflictsBody }), checkConflicts);
// ── Bulk operations (Screen 4 Roster tab) ─────────────────
router.post('/bulk-transfer', validate({ body: bulkTransferBody }), bulkTransferEnrollment);
router.patch('/bulk-status', validate({ body: bulkStatusBody }), bulkUpdateEnrollmentStatus);
router.get('/team/:teamId', validate({ params: z.object({ teamId: objectId }) }), getTeamEnrollments);
router.get('/user/:userId', validate({ params: z.object({ userId: objectId }) }), getUserEnrollments);
router.put('/:id', validate({ params: idParam, body: updateEnrollmentBody }), updateEnrollment);
router.post('/:id/transfer', validate({ params: idParam, body: transferEnrollmentBody }), transferEnrollment);

module.exports = router;
