const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const { listSchedulesQuery } = require('../../schemas/schedule');
const { listCohortsQuery } = require('../learning/schemas');

// ──────────────────────────────────────────────────────────
// English-class routes — mounted at /api/english.
// ──────────────────────────────────────────────────────────
// Bounded read surface for the legacy English-class (team-booking) world so
// the generic Training/Learning surfaces never mix scheduling worlds (owner
// decision 2026-06-12). Gating mirrors each delegated endpoint:
//   /classes             ≈ GET /api/learning/cohorts   (protect only)
//   /schedules           ≈ GET /api/schedules          (protect + Participant
//                          enrolled-only scope inside the controller)
//   /attendance-calendar ≈ GET /api/schedules/attendance-calendar
//                          (Admin all; Teacher scoped in the use-case)
// Mutations intentionally have NO routes here — they stay on /api/teams,
// /api/schedules and /api/evaluations, where mode policy is enforced.

router.use(protect);

router.get('/classes', validate({ query: listCohortsQuery }), controller.listClasses);
router.get('/schedules', validate({ query: listSchedulesQuery }), controller.listSchedules);
router.get('/attendance-calendar', roleGuard('Admin', 'Teacher'), controller.attendanceCalendar);

module.exports = router;
