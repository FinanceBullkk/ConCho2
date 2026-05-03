const router = require('express').Router();
const { upsertEvaluation, getEvaluations, getEvaluationById, deleteEvaluation } = require('../controllers/evaluationController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { upsertEvaluationBody } = require('../schemas/evaluation');
const { idParam } = require('../schemas/common');

// Create/update: Teacher or Admin (validated)
router.post('/', protect, roleGuard('Admin', 'Teacher'), validate({ body: upsertEvaluationBody }), upsertEvaluation);

// Read: any authenticated user
router.get('/', protect, getEvaluations);
router.get('/:id', protect, getEvaluationById);

// Delete: Admin only
router.delete('/:id', protect, roleGuard('Admin'), deleteEvaluation);

module.exports = router;
