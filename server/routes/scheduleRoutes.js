const router = require('express').Router();
const {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeam, cancelTeam, getAvailability
} = require('../controllers/scheduleController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { idParam } = require('../schemas/common');
const {
  createScheduleBody,
  updateScheduleBody,
  listSchedulesQuery,
  availabilityQuery,
  bookTeamBody,
} = require('../schemas/schedule');

// Team booking endpoints (before /:id to avoid routing conflicts)
router.get('/availability', protect, validate({ query: availabilityQuery }), getAvailability);
router.post('/:id/book-team', protect, roleGuard('Admin', 'Participant'),
  validate({ params: idParam, body: bookTeamBody }), bookTeam);
router.post('/:id/cancel-team', protect, roleGuard('Admin', 'Participant'),
  validate({ params: idParam, body: bookTeamBody }), cancelTeam);

// CRUD
router.route('/')
  .get(protect, validate({ query: listSchedulesQuery }), getSchedules)
  .post(protect, roleGuard('Admin'), validate({ body: createScheduleBody }), createSchedule);

router.route('/:id')
  .get(protect, validate({ params: idParam }), getScheduleById)
  .put(protect, roleGuard('Admin'),
    validate({ params: idParam, body: updateScheduleBody }), updateSchedule)
  .delete(protect, roleGuard('Admin'),
    validate({ params: idParam }), deleteSchedule);

module.exports = router;
