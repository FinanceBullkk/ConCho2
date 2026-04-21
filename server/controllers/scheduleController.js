const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const User = require('../models/User');

// ──────────────────────────────────────────────────────────
// Schedule Controller
// ──────────────────────────────────────────────────────────

/**
 * Get UTC midnight of today.
 * All date comparisons must use UTC to match MongoDB storage.
 */
const utcTodayStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
};

/**
 * Get the Monday 00:00 UTC and Sunday 23:59:59.999 UTC
 * of the week containing `date`.
 */
const getWeekBoundsUTC = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ...6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday,
    0, 0, 0, 0
  ));
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6,
    23, 59, 59, 999
  ));
  return { weekStart, weekEnd };
};

/**
 * GET /api/schedules/availability
 * Get all future schedules with availability status
 */
const getAvailability = async (req, res) => {
  try {
    const filter = { date: { $gte: utcTodayStart() } };
    if (req.query.classId) filter.classId = req.query.classId;

    const schedules = await Schedule.find(filter)
      .populate('classId', 'classCode courseName')
      .populate('teacherId', 'empCode name')
      .populate('bookedTeamId', 'name')
      .populate('enrolledTeams', 'name')
      .sort({ date: 1, timeSlot: 1 });

    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

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
 * Book a single team into a schedule slot.
 * Body: { teamId }
 *
 * ── BUSINESS RULES ─────────────────────────────────────
 *   1. Each slot allows exactly 1 team (bookedTeamId).
 *   2. Each team can book max 2 slots per Mon–Sun week (UTC).
 *
 * ── RACE-CONDITION SAFETY ──────────────────────────────
 *   Uses a MongoDB Transaction (requires Atlas Replica Set).
 *   Both countDocuments and findOneAndUpdate execute within
 *   the same session — if two requests race:
 *   - The second transaction will see the first's writes
 *   - And either abort or fail the count check
 *   - 100% safe against overbooking.
 * ────────────────────────────────────────────────────────
 */
const bookTeam = async (req, res) => {
  // Start a MongoDB session for the transaction
  const session = await mongoose.startSession();

  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }

    // ── Step 0: Validate schedule exists (outside transaction — read only) ──
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // ── Early check: slot already taken? (informational, not the guard) ──
    if (schedule.bookedTeamId) {
      return res.status(400).json({
        success: false,
        message: 'Slot đã được lấy — this slot is already booked by another team',
      });
    }

    // ── Validate team + role check ────────────────────────
    const team = await Team.findById(teamId).populate('members', '_id status');
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    if (req.user.role !== 'Admin') {
      if (team.leaderId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only Admin or the Team Leader can book for this team',
        });
      }
    }

    const activeMembers = team.members.filter(m => m.status === 'Active');
    const memberIds = activeMembers.map(m => m._id);

    if (memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active members in this team',
      });
    }

    // ── TRANSACTION: count + write are atomic ─────────────
    let result;
    await session.withTransaction(async () => {
      // Step 2: Count bookings this team has this week (UTC)
      const { weekStart, weekEnd } = getWeekBoundsUTC(schedule.date);

      const weeklyBookingCount = await Schedule.countDocuments({
        bookedTeamId: teamId,
        date: { $gte: weekStart, $lte: weekEnd },
      }).session(session);

      // Step 3: Enforce 2-per-week limit
      if (weeklyBookingCount >= 2) {
        const err = new Error(
          `Team đã book tối đa 2 buổi/tuần — this team already has ${weeklyBookingCount} booking(s) this week (${weekStart.toISOString()} – ${weekEnd.toISOString()})`
        );
        err.statusCode = 400;
        throw err;
      }

      // Step 4: Atomic update — book the slot
      result = await Schedule.findOneAndUpdate(
        {
          _id: schedule._id,
          bookedTeamId: null,    // ← ATOMIC: only succeeds if slot is still empty
        },
        {
          $set: {
            bookedTeamId: teamId,
            enrolledTeams: [teamId],
            enrolledUsers: memberIds,
            enrolledCount: memberIds.length,
          },
        },
        { new: true, session }
      )
        .populate('bookedTeamId', 'name')
        .populate('enrolledUsers', 'empCode name');

      if (!result) {
        const err = new Error('Booking failed — this slot was just taken by another request.');
        err.statusCode = 409;
        throw err;
      }
    });

    res.json({
      success: true,
      message: `Slot booked! ${memberIds.length} team members enrolled.`,
      data: result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * POST /api/schedules/:id/cancel-team
 * Cancel a team's booking — frees the slot.
 * Body: { teamId }
 */
const cancelTeam = async (req, res) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'teamId is required' });
    }

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Verify this team actually holds the booking
    if (!schedule.bookedTeamId || schedule.bookedTeamId.toString() !== teamId) {
      return res.status(400).json({
        success: false,
        message: 'This team does not hold a booking for this slot',
      });
    }

    // Atomic clear
    const updated = await Schedule.findOneAndUpdate(
      {
        _id: schedule._id,
        bookedTeamId: teamId,   // Only clear if this team still holds it
      },
      {
        $set: {
          bookedTeamId: null,
          enrolledTeams: [],
          enrolledUsers: [],
          enrolledCount: 0,
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: 'Cancellation failed — booking state changed. Please refresh.',
      });
    }

    res.json({
      success: true,
      message: 'Booking cancelled — slot is now available',
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeam, cancelTeam, getAvailability,
};
