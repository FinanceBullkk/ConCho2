const router = require('express').Router();
const { getTeams, getTeamById, createTeam, updateTeam, deleteTeam, getMyTeams, getTeamProgress } = require('../controllers/teamController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { idParam } = require('../schemas/common');
const { createTeamBody, updateTeamBody } = require('../schemas/team');

// ── Participant-accessible routes (must be BEFORE Admin guard) ──
// Leaders need this to discover which teams they lead for booking.
router.get('/my-teams', protect, getMyTeams);

// All remaining team CRUD is Admin-only
router.use(protect, roleGuard('Admin'));

router.route('/')
  .get(getTeams)
  .post(validate({ body: createTeamBody }), createTeam);

router.route('/:id')
  .get(validate({ params: idParam }), getTeamById)
  .put(validate({ params: idParam, body: updateTeamBody }), updateTeam)
  .delete(validate({ params: idParam }), deleteTeam);

router.route('/:id/progress')
  .get(validate({ params: idParam }), getTeamProgress);

module.exports = router;
