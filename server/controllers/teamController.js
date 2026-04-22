const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');

// ──────────────────────────────────────────────────────────
// Team Controller (Admin Only)
// ──────────────────────────────────────────────────────────
// The DYNAMIC TEAM SYNC logic lives in the Team model
// middleware (models/Team.js). When updateTeam changes the
// members array via findOneAndUpdate, the post middleware
// auto-syncs all future schedules.
// ──────────────────────────────────────────────────────────

/**
 * GET /api/teams
 * Get all teams (populated with leader and member details)
 */
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status')
      .sort({ name: 1 });

    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/teams/:id
 * Get single team by ID
 */
const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/teams
 * Create a new team
 */
const createTeam = async (req, res) => {
  try {
    const { name, leaderId, members } = req.body;

    // Ensure leader is included in members
    let memberList = members || [];
    if (leaderId && !memberList.includes(leaderId)) {
      memberList = [leaderId, ...memberList];
    }

    const team = await Team.create({ name, leaderId, members: memberList });

    // Return populated
    const populated = await Team.findById(team._id)
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/teams/:id
 * Update a team
 *
 * IMPORTANT: Uses findOneAndUpdate which triggers the
 * Dynamic Team Sync middleware in Team.js
 */
const updateTeam = async (req, res) => {
  try {
    const { name, leaderId, members } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (leaderId !== undefined) updateData.leaderId = leaderId;
    if (members !== undefined) {
      // Ensure leader is in members if both provided
      if (leaderId && !members.includes(leaderId)) {
        updateData.members = [leaderId, ...members];
      } else {
        updateData.members = members;
      }
    }

    const team = await Team.findOneAndUpdate(
      { _id: req.params.id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Return populated
    const populated = await Team.findById(team._id)
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/teams/my-teams
 * Get teams where the logged-in user is the leader.
 * Accessible by Participants for the booking flow.
 */
const getMyTeams = async (req, res) => {
  try {
    const teams = await Team.find({ leaderId: req.user._id })
      .populate('classId', 'classCode courseName')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status')
      .sort({ name: 1 });

    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/teams/:id
 * Delete a team — CASCADE: also removes related Schedules & Attendance.
 *
 * Cascade order (referential integrity):
 *   1. Find all Schedules booked by this team
 *   2. Delete Attendance records for those schedules
 *   3. Delete the Schedules themselves
 *   4. Delete the Team
 */
const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Step 1: Find related schedules
    const scheduleIds = await Schedule.find({ bookedTeamId: team._id })
      .select('_id').lean();
    const ids = scheduleIds.map(s => s._id);

    // Step 2: Cascade delete attendance → schedules
    let deletedAttendance = 0;
    let deletedSchedules = 0;
    if (ids.length > 0) {
      const attResult = await Attendance.deleteMany({ scheduleId: { $in: ids } });
      deletedAttendance = attResult.deletedCount;
      const schResult = await Schedule.deleteMany({ _id: { $in: ids } });
      deletedSchedules = schResult.deletedCount;
    }

    // Step 3: Delete the team itself
    await Team.findByIdAndDelete(team._id);

    res.json({
      success: true,
      message: `Team "${team.name}" deleted`,
      cascade: { deletedSchedules, deletedAttendance },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getTeams, getTeamById, createTeam, updateTeam, deleteTeam, getMyTeams };

