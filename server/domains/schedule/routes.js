const router = require('express').Router();
const {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules,
  getAttendanceCalendar, setTrainers
} = require('./controller');
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { bookingLimiter } = require('../../middleware/rateLimiters');
const { idParam } = require('../../schemas/common');
const {
  createScheduleBody,
  updateScheduleBody,
  listSchedulesQuery,
  availabilityQuery,
  bookTeamSlotBody,
  setTrainersBody,
} = require('../../schemas/schedule');

// ──────────────────────────────────────────────────────────
// Schedule routes — mounted at /api/schedules (Phase 1 domain extraction;
// relocated from routes/scheduleRoutes.js, behavior-preserving).
// ──────────────────────────────────────────────────────────

// ── Leader booking endpoints (before /:id to avoid routing conflicts) ──
router.get('/availability', protect, validate({ query: availabilityQuery }), getAvailability);
router.get('/my-class', protect, getMyClassSchedules);

// ── Attendance calendar (Admin all; Teacher scoped by Class.teacherIds) ────
router.get('/attendance-calendar', protect, roleGuard('Admin', 'Teacher'), getAttendanceCalendar);

router.post('/book-slot', protect, roleGuard('Admin', 'Participant'),
  bookingLimiter, validate({ body: bookTeamSlotBody }), bookTeamSlot);

router.delete('/:id/cancel', protect, roleGuard('Admin', 'Participant'),
  validate({ params: idParam }), cancelSlot);

// ── Trainers (re-center Phase 3) — Admin + Coordinator (before /:id) ──
// Capability-gated (session.assign-trainer) so a Coordinator can assign
// without full Admin; roleGuard belt keeps Teacher/Participant out cheaply.
router.put('/:id/trainers', protect, roleGuard('Admin', 'Coordinator'),
  requireCapability('session.assign-trainer'),
  validate({ params: idParam, body: setTrainersBody }), setTrainers);

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
