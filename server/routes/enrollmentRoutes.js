const router = require('express').Router();
const {
  getEnrollments,
  getTeamEnrollments,
  getUserEnrollments,
  updateEnrollment,
  checkConflicts,
} = require('../controllers/enrollmentController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// All routes require authentication and Admin role
router.use(protect, roleGuard('Admin'));

router.get('/', getEnrollments);
router.post('/check-conflicts', checkConflicts);
router.get('/team/:teamId', getTeamEnrollments);
router.get('/user/:userId', getUserEnrollments);
router.put('/:id', updateEnrollment);

module.exports = router;
