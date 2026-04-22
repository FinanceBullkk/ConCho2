const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');

// ──────────────────────────────────────────────────────────
// Schedule Service
// ──────────────────────────────────────────────────────────
// Pure business logic — no req/res objects.
// Each method receives plain data and returns a result or
// throws a typed error with a statusCode property.
//
// ARCHITECTURE:
//   Controller (parse req/res) → Service (logic) → Model (DB)
// ──────────────────────────────────────────────────────────

/**
 * Custom error class with HTTP status code.
 * Controllers catch these and map statusCode → res.status().
 */
class ServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Get Monday 00:00:00 UTC – Sunday 23:59:59.999 UTC
 * of the ISO week containing `date`.
 */
const getWeekBounds = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(),
    d.getUTCDate() + diffToMonday, 0, 0, 0, 0
  ));
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(), weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 6, 23, 59, 59, 999
  ));

  return { weekStart, weekEnd };
};

/**
 * Return UTC midnight today.
 */
const utcToday = () => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
};

// ── Core Business Logic ──────────────────────────────────

/**
 * Book a time slot for a team.
 *
 * @param {Object} params
 * @param {string} params.teamId
 * @param {string} params.startTime   ISO date string
 * @param {string} params.endTime     ISO date string
 * @param {Object} params.requestUser The authenticated user (req.user)
 * @returns {Object} populated Schedule document
 * @throws {ServiceError} on validation/conflict/limit failures
 */
const bookSlot = async ({ teamId, startTime, endTime, requestUser }) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // ── Validate times ────────────────────────────────────
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ServiceError('startTime and endTime must be valid ISO dates');
  }
  if (end <= start) {
    throw new ServiceError('endTime must be after startTime');
  }

  // ── Step 1: Identify Class via Team ───────────────────
  const team = await Team.findById(teamId).populate('members', '_id status');
  if (!team) throw new ServiceError('Team not found', 404);
  if (!team.classId) {
    throw new ServiceError('Team chưa được gán lớp — This team has no assigned class');
  }

  // ── Authorization check ───────────────────────────────
  if (requestUser.role !== 'Admin') {
    if (team.leaderId.toString() !== requestUser._id.toString()) {
      throw new ServiceError('Only Admin or the Team Leader can book for this team', 403);
    }
  }

  const activeMembers = team.members.filter(m => m.status === 'Active');
  const memberIds = activeMembers.map(m => m._id);

  // ── TRANSACTION: Atomic booking ───────────────────────
  const session = await mongoose.startSession();
  let created;

  try {
    await session.withTransaction(async () => {
      // Step 2: Weekly Limit — max 2 sessions per team per week
      const { weekStart, weekEnd } = getWeekBounds(start);
      const weeklyCount = await Schedule.countDocuments({
        bookedTeamId: teamId,
        startTime: { $gte: weekStart, $lte: weekEnd },
      }).session(session);

      if (weeklyCount >= 2) {
        throw new ServiceError(
          `Team đã đặt tối đa 2 buổi/tuần — This team already has ${weeklyCount} session(s) this week`
        );
      }

      // Step 3: Collision — no overlapping schedule
      const collision = await Schedule.findOne({
        startTime: { $lt: end },
        endTime: { $gt: start },
      }).session(session);

      if (collision) {
        throw new ServiceError(
          'Khung giờ này đã bị Team khác đặt — This time slot is already taken',
          409
        );
      }

      // Step 4: Create the Schedule
      const [doc] = await Schedule.create(
        [{
          classId: team.classId,
          bookedTeamId: teamId,
          startTime: start,
          endTime: end,
          enrolledUsers: memberIds,
          enrolledCount: memberIds.length,
        }],
        { session }
      );
      created = doc;
    });
  } finally {
    session.endSession();
  }

  // Populate for response
  return Schedule.findById(created._id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name');
};

/**
 * Cancel (delete) a booked schedule.
 *
 * @param {string} scheduleId
 * @param {Object} requestUser
 * @throws {ServiceError} if not found or not authorized
 */
const cancelSlot = async (scheduleId, requestUser) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new ServiceError('Schedule not found', 404);

  if (requestUser.role !== 'Admin') {
    const team = await Team.findById(schedule.bookedTeamId);
    if (!team || team.leaderId.toString() !== requestUser._id.toString()) {
      throw new ServiceError('Only Admin or the Team Leader can cancel this booking', 403);
    }
  }

  await Schedule.findByIdAndDelete(schedule._id);
};

/**
 * Get future schedules (availability view).
 * @param {Object} filters  { classId? }
 */
const getAvailability = async (filters = {}) => {
  const query = { startTime: { $gte: utcToday() } };
  if (filters.classId) query.classId = filters.classId;

  return Schedule.find(query)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('teacherId', 'empCode name')
    .sort({ startTime: 1 });
};

/**
 * Get schedules with filters and pagination.
 */
const listSchedules = async (filters, { page, limit, skip }) => {
  const query = {};
  if (filters.classId) query.classId = filters.classId;
  if (filters.teacherId) query.teacherId = filters.teacherId;
  if (filters.from || filters.to) {
    query.startTime = {};
    if (filters.from) query.startTime.$gte = new Date(filters.from);
    if (filters.to) query.startTime.$lte = new Date(filters.to);
  }

  const [schedules, total] = await Promise.all([
    Schedule.find(query)
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .populate('teacherId', 'empCode name')
      .populate('enrolledUsers', 'empCode name department')
      .sort({ startTime: 1 })
      .skip(skip).limit(limit),
    Schedule.countDocuments(query),
  ]);

  return { schedules, total };
};

/**
 * Get a single schedule by ID.
 */
const getById = async (id) => {
  const schedule = await Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('teacherId', 'empCode name')
    .populate('enrolledUsers', 'empCode name department status');

  if (!schedule) throw new ServiceError('Schedule not found', 404);
  return schedule;
};

/**
 * Get upcoming schedules for a participant's team/class.
 */
const getMyClassSchedules = async (userId) => {
  const teams = await Team.find({ members: userId }).select('classId name').lean();
  if (teams.length === 0) return { schedules: [], team: null };

  const classIds = teams.map(t => t.classId).filter(Boolean);
  if (classIds.length === 0) return { schedules: [], team: teams[0]?.name };

  const schedules = await Schedule.find({
    classId: { $in: classIds },
    startTime: { $gte: utcToday() },
  })
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('teacherId', 'empCode name')
    .sort({ startTime: 1 })
    .limit(20);

  return { schedules, team: teams[0]?.name };
};

module.exports = {
  ServiceError,
  bookSlot,
  cancelSlot,
  getAvailability,
  listSchedules,
  getById,
  getMyClassSchedules,
};
