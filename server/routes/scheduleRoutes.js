const router = require('express').Router();
const {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules, assignTeacher,
  getAttendanceCalendar
} = require('../controllers/scheduleController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { bookingLimiter } = require('../middleware/rateLimiters');
const { idParam } = require('../schemas/common');
const {
  createScheduleBody,
  updateScheduleBody,
  listSchedulesQuery,
  availabilityQuery,
  bookTeamSlotBody,
} = require('../schemas/schedule');

// ── Leader booking endpoints (before /:id to avoid routing conflicts) ──
router.get('/availability', protect, validate({ query: availabilityQuery }), getAvailability);
router.get('/my-class', protect, getMyClassSchedules);

// ── Attendance calendar (Admin/Teacher) ───────────────────
router.get('/attendance-calendar', protect, roleGuard('Admin', 'Teacher'), getAttendanceCalendar);

router.post('/book-slot', protect, roleGuard('Admin', 'Participant'),
  bookingLimiter, validate({ body: bookTeamSlotBody }), bookTeamSlot);

router.delete('/:id/cancel', protect, roleGuard('Admin', 'Participant'),
  validate({ params: idParam }), cancelSlot);

// ── Teacher assignment ────────────────────────────────────────
router.patch('/:id/assign-teacher', protect, roleGuard('Admin', 'Teacher'),
  validate({ params: idParam }), assignTeacher);

// ── Admin CRUD ─────────────────────────────────────────────
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
