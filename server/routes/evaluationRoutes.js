const router = require('express').Router();
const { upsertEvaluation, getEvaluations, getEvaluationById, deleteEvaluation } = require('../controllers/evaluationController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { upsertEvaluationBody } = require('../schemas/evaluation');
const { idParam } = require('../schemas/common');

// Create/update: Teacher or Admin (validated)
router.post('/', protect, roleGuard('Admin', 'Teacher'), validate({ body: upsertEvaluationBody }), upsertEvaluation);

// Read: Admin unrestricted; Teacher must supply classId + pass the class-binding
// check (enforced in getEvaluations); Participants pinned to their own userId
// here (SEC-IDOR-01).
router.get('/', protect, (req, _res, next) => {
  if (req.user.role === 'Participant') {
    req.query.userId = req.user._id.toString();
  }
  next();
}, getEvaluations);
// SEC-014: validate :id so a malformed ObjectId is a 400, never a CastError 500.
router.get('/:id', protect, roleGuard('Admin', 'Teacher'), validate({ params: idParam }), getEvaluationById);

// Delete: Admin only
router.delete('/:id', protect, roleGuard('Admin'), validate({ params: idParam }), deleteEvaluation);

module.exports = router;
