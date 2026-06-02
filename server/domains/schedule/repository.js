const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const Attendance = require('../../models/Attendance');

// ── Schedule ──────────────────────────────────────────────

const findScheduleById = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name department status');

const findScheduleByIdRaw = (id) => Schedule.findById(id);

const updateScheduleById = (id, data, session) =>
  Schedule.findByIdAndUpdate(id, data, {
    new: true, runValidators: true, ...(session && { session }),
  });

const deleteScheduleById = (id, session) =>
  Schedule.findByIdAndDelete(id, ...(session ? [{ session }] : []));

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

const findScheduleForCollision = (classId, start, end, excludeId, session) => {
  const query = {
    classId,
    startTime: { $lt: end },
    endTime: { $gt: start },
  };
  if (excludeId) query._id = { $ne: excludeId };
  let q = Schedule.findOne(query);
  if (session) q = q.session(session);
  return q;
};

const countSchedulesForTeamInWeek = (teamId, weekStart, weekEnd, excludeId, session) => {
  const query = {
    bookedTeamId: teamId,
    startTime: { $gte: weekStart, $lte: weekEnd },
  };
  if (excludeId) query._id = { $ne: excludeId };
  let q = Schedule.countDocuments(query);
  if (session) q = q.session(session);
  return q;
};

module.exports = {
  findScheduleById,
  findScheduleByIdRaw,
  updateScheduleById,
  deleteScheduleById,
  deleteAttendanceByScheduleId,
  attendanceExistsForSchedule,
  findTeamById,
  findScheduleForCollision,
  countSchedulesForTeamInWeek,
};