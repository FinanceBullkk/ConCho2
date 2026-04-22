const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// ──────────────────────────────────────────────────────────
// Schedule Controller (v2 — Leader-Created Sessions)
// ──────────────────────────────────────────────────────────

/**
 * Get the Monday 00:00:00 UTC and Sunday 23:59:59.999 UTC of
 * the ISO week containing `date`.
 *
 * WHY UTC?  The old version used server-local time (setHours).
 * If the server runs in UTC+7 locally but later deploys to a
 * UTC-0 cloud host, the week boundaries shift by 7 hours,
 * causing wrong weekly-limit counts. Using UTC makes the
 * calculation deterministic regardless of server timezone.
 */
const getWeekBounds = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + diffToMonday,
    0, 0, 0, 0
  ));

  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 6,
    23, 59, 59, 999
  ));

  return { weekStart, weekEnd };
};

// ──────────────────────────────────────────────────────────
// CORE: Book a Team Slot (Leader creates a Schedule)
// ──────────────────────────────────────────────────────────
/**
 * POST /api/schedules/book-slot
 * Body: { teamId, startTime (ISO), endTime (ISO) }
 *
 * BUSINESS RULES (all inside a MongoDB transaction):
 *   1. Identify Class — team.classId must exist.
 *   2. Weekly Limit — max 2 sessions per team per Mon–Sun week.
 *   3. Conflict Collision — no overlapping schedule in the same time range.
 *   4. Execute — create the Schedule document.
 */
const bookTeamSlot = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { teamId, startTime, endTime } = req.body;

    // ── Parse & validate times ────────────────────────────
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'startTime and endTime must be valid ISO dates',
      });
    }
    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: 'endTime must be after startTime',
      });
    }

    // ── Step 1: Identify Class via Team ───────────────────
    const team = await Team.findById(teamId).populate('members', '_id status');
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    if (!team.classId) {
      return res.status(400).json({
        success: false,
        message: 'Team chưa được gán lớp — This team has no assigned class',
      });
    }

    // ── Auth: only Admin or Team Leader ───────────────────
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

    // ── TRANSACTION ──────────────────────────────────────
    let created;
    await session.withTransaction(async () => {

      // Step 2: Weekly Limit — max 2 sessions per team this week
      const { weekStart, weekEnd } = getWeekBounds(start);

      const weeklyCount = await Schedule.countDocuments({
        bookedTeamId: teamId,
        startTime: { $gte: weekStart, $lte: weekEnd },
      }).session(session);

      if (weeklyCount >= 2) {
        const err = new Error(
          `Team đã đặt tối đa 2 buổi/tuần — This team already has ${weeklyCount} session(s) this week (${weekStart.toLocaleDateString()} – ${weekEnd.toLocaleDateString()})`
        );
        err.statusCode = 400;
        throw err;
      }

      // Step 3: Conflict Collision — no overlapping schedule
      // Standard interval overlap: A.start < B.end AND A.end > B.start
      const collision = await Schedule.findOne({
        startTime: { $lt: end },
        endTime: { $gt: start },
      }).session(session);

      if (collision) {
        const err = new Error(
          'Khung giờ này đã bị Team khác đặt — This time slot is already taken'
        );
        err.statusCode = 409;
        throw err;
      }

      // Step 4: Create the Schedule document
      const [doc] = await Schedule.create(
        [
          {
            classId: team.classId,
            bookedTeamId: teamId,
            startTime: start,
            endTime: end,
            enrolledUsers: memberIds,
            enrolledCount: memberIds.length,
          },
        ],
        { session }
      );

      created = doc;
    });

    // Populate for the response
    const populated = await Schedule.findById(created._id)
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .populate('enrolledUsers', 'empCode name');

    res.status(201).json({
      success: true,
      message: `Đặt lịch thành công! ${memberIds.length} thành viên đã được ghi danh.`,
      data: populated,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// ──────────────────────────────────────────────────────────
// Cancel a booking = DELETE the schedule
// ──────────────────────────────────────────────────────────
/**
 * DELETE /api/schedules/:id/cancel
 * Since the Leader created the schedule, cancelling removes it entirely.
 */
const cancelSlot = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Auth: only Admin or the team's leader
    if (req.user.role !== 'Admin') {
      const team = await Team.findById(schedule.bookedTeamId);
      if (!team || team.leaderId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Only Admin or the Team Leader can cancel this booking',
        });
      }
    }

    await Schedule.findByIdAndDelete(schedule._id);

    res.json({
      success: true,
      message: 'Đã hủy lịch — Schedule cancelled and removed',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────────
// GET endpoints (updated for startTime/endTime)
// ──────────────────────────────────────────────────────────

/**
 * GET /api/schedules/availability
 * Get all future schedules — the calendar uses this to render
 * which time slots are already taken.
 */
const getAvailability = async (req, res) => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const filter = { startTime: { $gte: now } };
    if (req.query.classId) filter.classId = req.query.classId;

    const schedules = await Schedule.find(filter)
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .populate('teacherId', 'empCode name')
      .sort({ startTime: 1 });

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
      filter.startTime = {};
      if (req.query.from) filter.startTime.$gte = new Date(req.query.from);
      if (req.query.to) filter.startTime.$lte = new Date(req.query.to);
    }

    const { page, limit, skip } = parsePagination(req);
    const [schedules, total] = await Promise.all([
      Schedule.find(filter)
        .populate('classId', 'classCode courseName')
        .populate('bookedTeamId', 'name')
        .populate('teacherId', 'empCode name')
        .populate('enrolledUsers', 'empCode name department')
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(limit),
      Schedule.countDocuments(filter),
    ]);

    res.json(paginatedResponse({ data: schedules, total, page, limit }));
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
      .populate('bookedTeamId', 'name')
      .populate('teacherId', 'empCode name')
      .populate('enrolledUsers', 'empCode name department status');

    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/schedules  (Admin manual create)
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
 * PUT /api/schedules/:id  (Admin edit)
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
 * DELETE /api/schedules/:id  (Admin delete)
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
 * GET /api/schedules/my-class
 * Get upcoming schedules for the logged-in participant's team/class.
 * Finds which team(s) the user belongs to → gets classId(s) → fetches schedules.
 */
const getMyClassSchedules = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find teams where this user is a member
    const teams = await Team.find({ members: userId }).select('classId name').lean();
    if (teams.length === 0) {
      return res.json({ success: true, count: 0, data: [], team: null });
    }

    const classIds = teams.map(t => t.classId).filter(Boolean);
    if (classIds.length === 0) {
      return res.json({ success: true, count: 0, data: [], team: teams[0]?.name });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const schedules = await Schedule.find({
      classId: { $in: classIds },
      startTime: { $gte: now },
    })
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .populate('teacherId', 'empCode name')
      .sort({ startTime: 1 })
      .limit(20);

    res.json({
      success: true,
      count: schedules.length,
      data: schedules,
      team: teams[0]?.name,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules,
};
