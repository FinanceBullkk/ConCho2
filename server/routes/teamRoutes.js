const router = require('express').Router();
const { getTeams, getTeamById, createTeam, updateTeam, deleteTeam } = require('../controllers/teamController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// All team CRUD is Admin-only
router.use(protect, roleGuard('Admin'));

router.route('/').get(getTeams).post(createTeam);
router.route('/:id').get(getTeamById).put(updateTeam).delete(deleteTeam);

module.exports = router;
