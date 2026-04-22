const router = require('express').Router();
const { getTeams, getTeamById, createTeam, updateTeam, deleteTeam, getMyTeams } = require('../controllers/teamController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// ── Participant-accessible routes (must be BEFORE Admin guard) ──
// Leaders need this to discover which teams they lead for booking.
router.get('/my-teams', protect, getMyTeams);

// All remaining team CRUD is Admin-only
router.use(protect, roleGuard('Admin'));

router.route('/').get(getTeams).post(createTeam);
router.route('/:id').get(getTeamById).put(updateTeam).delete(deleteTeam);

module.exports = router;
