const router = require('express').Router();
const {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeam, cancelTeam, getAvailability
} = require('../controllers/scheduleController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Team booking endpoints (before /:id to avoid routing conflicts)
router.get('/availability', protect, getAvailability);
router.post('/:id/book-team', protect, roleGuard('Admin', 'Participant'), bookTeam);
router.post('/:id/cancel-team', protect, roleGuard('Admin', 'Participant'), cancelTeam);

// CRUD
router.route('/')
  .get(protect, getSchedules)
  .post(protect, roleGuard('Admin'), createSchedule);

router.route('/:id')
  .get(protect, getScheduleById)
  .put(protect, roleGuard('Admin'), updateSchedule)
  .delete(protect, roleGuard('Admin'), deleteSchedule);

module.exports = router;
