const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const User = require('../models/User');

// ──────────────────────────────────────────────────────────
// Schedule Controller
// ──────────────────────────────────────────────────────────

/**
 * GET /api/schedules
 * Filters: ?classId=&teacherId=&from=&to=
 */
const getSchedules = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const schedules = await Schedule.find(filter)
      .populate('classId', 'classCode courseName')
      .populate('teacherId', 'empCode name')
      .populate('enrolledTeams', 'name')
      .populate('enrolledUsers', 'empCode name department')
      .sort({ date: 1, timeSlot: 1 });

    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/schedules/:id
 */
const getScheduleById = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate('classId', 'classCode courseName')
      .populate('teacherId', 'empCode name')
      .populate('enrolledTeams', 'name')
      .populate('enrolledUsers', 'empCode name department status');

    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/schedules
 */
const createSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.create(req.body);
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/schedules/:id
 */
const updateSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/schedules/:id
 */
const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/schedules/:id/book-team
 * Team-based booking: enroll an entire team into a schedule slot
 * Body: { teamId }
 */
const bookTeam = async (req, res) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // Check if team already booked
    if (schedule.enrolledTeams.map(id => id.toString()).includes(teamId)) {
      return res.status(400).json({ success: false, message: 'Team already enrolled in this schedule' });
    }

    // Get team with members
    const team = await Team.findById(teamId).populate('members', '_id status');
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    // Filter only active members not already enrolled
    const enrolledSet = new Set(schedule.enrolledUsers.map(id => id.toString()));
    const activeNewMembers = team.members.filter(
      m => m.status === 'Active' && !enrolledSet.has(m._id.toString())
    );

    // Check capacity
    if (schedule.enrolledCount + activeNewMembers.length > schedule.capacity) {
      return res.status(400).json({
        success: false,
        message: `Not enough capacity. Available: ${schedule.capacity - schedule.enrolledCount}, Required: ${activeNewMembers.length}`,
      });
    }

    // Atomic update
    const memberIds = activeNewMembers.map(m => m._id);
    const updated = await Schedule.findByIdAndUpdate(
      schedule._id,
      {
        $push: {
          enrolledTeams: teamId,
          enrolledUsers: { $each: memberIds },
        },
        $inc: { enrolledCount: memberIds.length },
      },
      { new: true }
    )
      .populate('enrolledTeams', 'name')
      .populate('enrolledUsers', 'empCode name');

    res.json({
      success: true,
      message: `Team enrolled: ${memberIds.length} members added`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/schedules/:id/cancel-team
 * Cancel a team's booking
 * Body: { teamId }
 */
const cancelTeam = async (req, res) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    if (!schedule.enrolledTeams.map(id => id.toString()).includes(teamId)) {
      return res.status(400).json({ success: false, message: 'Team is not enrolled' });
    }

    // Get team members to remove
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const memberIds = team.members;
    const enrolledSet = new Set(schedule.enrolledUsers.map(id => id.toString()));
    const toRemove = memberIds.filter(id => enrolledSet.has(id.toString()));

    const updated = await Schedule.findByIdAndUpdate(
      schedule._id,
      {
        $pull: {
          enrolledTeams: teamId,
          enrolledUsers: { $in: toRemove },
        },
        $inc: { enrolledCount: -toRemove.length },
      },
      { new: true }
    )
      .populate('enrolledTeams', 'name')
      .populate('enrolledUsers', 'empCode name');

    res.json({
      success: true,
      message: `Team booking cancelled: ${toRemove.length} members removed`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeam, cancelTeam,
};
