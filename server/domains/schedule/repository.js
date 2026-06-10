const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const Attendance = require('../../models/Attendance');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const User = require('../../models/User');

// ── Schedule ──────────────────────────────────────────────

const findScheduleById = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name department status');

const findScheduleByIdRaw = (id) => Schedule.findById(id);

// ── Read queries (Phase 1 extraction from scheduleService) ────
// Each mirrors the exact populate/sort/lean shape the legacy read functions
// used, so behaviour is preserved 1:1.

// getAvailability — future LIVE schedules, optionally scoped to a class.
// Durable-cancelled rows are history, not availability — the freed slot must
// render as bookable on the grid.
const findAvailabilitySchedules = ({ classId, fromDate }) => {
  const query = { startTime: { $gte: fromDate }, status: 'scheduled' };
  if (classId) query.classId = classId;
  return Schedule.find(query)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 });
};

// listSchedules — paginated list page.
const findSchedulesPage = (query, { skip, limit }) =>
  Schedule.find(query)
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name department')
    .sort({ startTime: 1 })
    .skip(skip).limit(limit)
    .lean({ virtuals: true });

const countSchedules = (query) => Schedule.countDocuments(query);

// getMyClassSchedules — the participant's team(s) + their upcoming sessions.
const findTeamsByMember = (userId) =>
  Team.find({ members: userId })
    .select('classId name leaderId')
    .populate('leaderId', 'name empCode email department')
    .lean();

const findUpcomingForClasses = (classIds, fromDate, limit) =>
  Schedule.find({ classId: { $in: classIds }, startTime: { $gte: fromDate }, status: 'scheduled' })
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 })
    .limit(limit)
    .lean({ virtuals: true });

// getAttendanceCalendar — LIVE schedules in an optional date window + teacher
// scope. Cancelled sessions never appear on the attendance calendar.
const findCalendarSchedules = (filter) =>
  Schedule.find({ ...filter, status: 'scheduled' })
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 })
    .lean({ virtuals: true });

// Teacher visibility: own classes OR legacy empty-teacherIds (graceful migration).
const findTeacherScopedClassIds = (teacherId) =>
  Class.find({
    $or: [
      { teacherIds: teacherId },
      { teacherIds: { $size: 0 } },
    ],
  }).select('_id').lean();

const aggregateAttendanceCounts = (scheduleIds) =>
  Attendance.aggregate([
    { $match: { scheduleId: { $in: scheduleIds } } },
    { $group: { _id: '$scheduleId', count: { $sum: 1 } } },
  ]);

const updateScheduleById = (id, data, session) =>
  Schedule.findByIdAndUpdate(id, data, {
    new: true, runValidators: true, ...(session && { session }),
  });

// ── Trainers (re-center Phase 3, DELTA B) ─────────────────
// Validate internal-trainer identities: only live (non-deleted), active
// Teacher/Admin users may be named as session instructors. Returns the subset
// of `ids` that resolve to a valid instructor (caller compares lengths).
const findValidInstructorIds = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const rows = await User.find({
    _id: { $in: ids },
    role: { $in: ['Teacher', 'Admin'] },
    status: { $ne: 'Dropped' },
    isDeleted: { $ne: true },
  }).select('_id').lean();
  return rows.map((r) => r._id);
};

const deleteScheduleById = (id, session) =>
  Schedule.findByIdAndDelete(id, ...(session ? [{ session }] : []));

// ── Durable cancellation (Wave E3 phase-04, slice A) ──────
// Atomic conditional flip: matches only a LIVE doc, so two concurrent cancels
// resolve as one winner (doc returned) and one loser (null → caller 409s).
// roomId is nulled in the same write — the caller releases the RoomBooking
// ledger row in the same tx, and field + ledger must never drift (B3).
const cancelScheduleById = (id, { cancelledBy = null, cancelReason = '' } = {}, session) =>
  Schedule.findOneAndUpdate(
    { _id: id, status: 'scheduled' },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: cancelReason || '',
        roomId: null,
      },
    },
    { new: true, ...(session && { session }) },
  );

// ── Attendance ────────────────────────────────────────────

const deleteAttendanceByScheduleId = (scheduleId, session) =>
  Attendance.deleteMany({ scheduleId }, ...(session ? [{ session }] : []));

const attendanceExistsForSchedule = (scheduleId, session) => {
  let q = Attendance.exists({ scheduleId });
  if (session) q = q.session(session);
  return q;
};

// ── Team ──────────────────────────────────────────────────

const findTeamById = (id, opts = {}) => {
  let q = Team.findById(id);
  if (opts.select) q = q.select(opts.select);
  if (opts.populate) q = q.populate(opts.populate);
  if (opts.lean) q = q.lean();
  if (opts.session) q = q.session(opts.session);
  return q;
};

// ── Composite queries (used by use-cases) ─────────────────

// Only LIVE sessions collide — a durable-cancelled row frees its slot
// (mirrors the partial-unique index, which is scoped the same way).
const findScheduleForCollision = (classId, start, end, excludeId, session) => {
  const query = {
    classId,
    startTime: { $lt: end },
    endTime: { $gt: start },
    status: 'scheduled',
  };
  if (excludeId) query._id = { $ne: excludeId };
  let q = Schedule.findOne(query);
  if (session) q = q.session(session);
  return q;
};

// Cancelled sessions don't consume the team's weekly quota.
const countSchedulesForTeamInWeek = (teamId, weekStart, weekEnd, excludeId, session) => {
  const query = {
    bookedTeamId: teamId,
    startTime: { $gte: weekStart, $lte: weekEnd },
    status: 'scheduled',
  };
  if (excludeId) query._id = { $ne: excludeId };
  let q = Schedule.countDocuments(query);
  if (session) q = q.session(session);
  return q;
};

// ── Scheduling-mode resolution (Pass C) ───────────────────
// Resolve a class/cohort's scheduling mode: Class.programId -> LearningProgram.
// Falls back to 'leader_booking' whenever the program link is absent (the
// repo-wide "open until populated" rule) so legacy program-less cohorts keep
// their team-booking behaviour. Mirrors the fallback in
// domains/learning/session/repository.findSchedulingContextBy* — keep in sync.
const findClassSchedulingMode = async (classId, session) => {
  if (!classId) return 'leader_booking';
  let cq = Class.findById(classId).select('programId').lean();
  if (session) cq = cq.session(session);
  const cls = await cq;
  if (!cls || !cls.programId) return 'leader_booking';
  let pq = LearningProgram.findById(cls.programId).select('schedulingMode').lean();
  if (session) pq = pq.session(session);
  const program = await pq;
  return program?.schedulingMode || 'leader_booking';
};

// ── Capacity-policy resolution (Wave E2) ──────────────────
// Resolve a class/cohort's program capacity policy: Class.programId ->
// LearningProgram.capacityPolicy. Returns {} for a program-less class (the
// "open until populated" rule) so such classes fall back to the per-session
// Schedule.capacity field. Mirrors findClassSchedulingMode.
const findClassCapacityPolicy = async (classId, session) => {
  if (!classId) return {};
  let cq = Class.findById(classId).select('programId').lean();
  if (session) cq = cq.session(session);
  const cls = await cq;
  if (!cls || !cls.programId) return {};
  let pq = LearningProgram.findById(cls.programId).select('capacityPolicy').lean();
  if (session) pq = pq.session(session);
  const program = await pq;
  return program?.capacityPolicy || {};
};

module.exports = {
  findScheduleById,
  findScheduleByIdRaw,
  updateScheduleById,
  deleteScheduleById,
  cancelScheduleById,
  deleteAttendanceByScheduleId,
  attendanceExistsForSchedule,
  findTeamById,
  findScheduleForCollision,
  countSchedulesForTeamInWeek,
  findClassSchedulingMode,
  findClassCapacityPolicy,
  findValidInstructorIds,
  // Read queries (Phase 1 extraction)
  findAvailabilitySchedules,
  findSchedulesPage,
  countSchedules,
  findTeamsByMember,
  findUpcomingForClasses,
  findCalendarSchedules,
  findTeacherScopedClassIds,
  aggregateAttendanceCounts,
};