const mongoose = require('mongoose');
const Attendance = require('../../models/Attendance');
const Schedule = require('../../models/Schedule');
const Class = require('../../models/Class');
const Team = require('../../models/Team');
const User = require('../../models/User');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// attendance/repository — MONGO impl (Phase 3 Wave-B dual-backend port).
// Verbatim of the pre-port repository.js: the single home for every Mongoose
// call in this domain (audit round 9: model access consolidated out of
// controller / marking / scope / analytics). ./repository.pg mirrors this
// interface 1:1; ./repository resolves between them by DB_BACKEND.
// Behaviour is preserved 1:1 — same filters, projections, populate, lean, sort
// and aggregation pipelines as the call sites they replace. The analytics
// pipelines live here (data-shaping); their scope resolution and in-memory
// rollups stay in ./analytics (orchestration).
// ──────────────────────────────────────────────────────────

// ── Schedule / Class reads ────────────────────────────────

// controller.loadClassForSchedule — authz context for a session.
const findScheduleForAuthz = (scheduleId) =>
  Schedule.findById(scheduleId).select('classId sessionInstructorIds').lean();

// marking.bulkMark — the live doc (non-lean: needs enrolledUsers + startTime).
const findScheduleDocById = (scheduleId) => Schedule.findById(scheduleId);

const findClassById = (classId) => Class.findById(classId).lean();

// scope + analyticsByTeam — live schedule ids for a set of classes.
const distinctScheduledIdsForClasses = (classIds) =>
  Schedule.distinct('_id', { classId: { $in: classIds }, status: 'scheduled' });

// analyticsByClass — live sessions of one class (ordered, minimal fields).
const findScheduledForClass = (classId) =>
  Schedule.find({ classId, status: 'scheduled' })
    .select('_id startTime endTime').sort({ startTime: 1 }).lean();

// ── Attendance reads / writes ─────────────────────────────

const findAttendanceBySchedule = (scheduleId) =>
  Attendance.find({ scheduleId })
    .populate('userId', 'empCode name department')
    .sort({ createdAt: 1 }); // creation order (populated-field sort is a no-op)

const findAttendanceByUser = (userId, scopeMatch = {}) =>
  Attendance.find({ userId, ...scopeMatch })
    .populate({
      path: 'scheduleId',
      populate: [{ path: 'classId', select: 'classCode courseName' }],
    })
    .sort({ createdAt: -1 });

// analyticsByClass — every record for a set of sessions (+ user identity).
const findAttendanceForSchedules = (scheduleIds) =>
  Attendance.find({ scheduleId: { $in: scheduleIds } })
    .populate('userId', 'empCode name').lean();

// enrollment enrichment (K1b slice 3) — raw (scheduleId,userId,status) rows for
// a set of live sessions + learners; the caller rolls them up per (user,class).
// Minimal projection, no populate.
const findAttendanceStatusRows = (scheduleIds, userIds) =>
  Attendance.find({ scheduleId: { $in: scheduleIds }, userId: { $in: userIds } })
    .select('scheduleId userId status').lean();

const bulkWriteAttendance = (operations) => Attendance.bulkWrite(operations);

// PERF-008: denormalise lastActiveAt onto User. $max never moves the timestamp
// backwards when an OLD session is re-marked after a more recent one.
const bumpUsersLastActive = (userIds, startTime) => {
  if (!userIds || userIds.length === 0) return Promise.resolve(null);
  return User.bulkWrite(
    userIds.map((uid) => ({
      updateOne: { filter: { _id: uid }, update: { $max: { lastActiveAt: startTime } } },
    })),
  );
};

// ── Analytics aggregations (data-shaping; rollups stay in ./analytics) ──

// By-employee rollup. `baseMatch` carries the Teacher scope (scopedAttendanceMatch);
// `filterUserId` is an optional string id validated + coerced here. Returns the
// paged groups + the pre-slice total.
const aggregateByEmployee = async (baseMatch, filterUserId, { skip = 0, limit = 100 } = {}) => {
  const match = { ...baseMatch };
  if (filterUserId) {
    if (!mongoose.Types.ObjectId.isValid(filterUserId)) {
      throw new ServiceError('Invalid userId format');
    }
    match.userId = new mongoose.Types.ObjectId(filterUserId);
  }

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$userId',
        totalSessions: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
      },
    },
    {
      // DATA-009: the $lookup pipeline form is required so we can $match
      // isDeleted at the join layer — pre('find')/pre('aggregate') hooks do NOT
      // fire inside a $lookup sub-pipeline, so soft-deleted users would
      // otherwise surface in analytics rollups.
      $lookup: {
        from: 'users',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$uid'] }, isDeleted: { $ne: true } } },
        ],
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        empCode: '$user.empCode', name: '$user.name',
        department: '$user.department',
        totalSessions: 1, present: 1, absent: 1, late: 1, excused: 1,
        attendanceRate: {
          $round: [{ $multiply: [{ $divide: ['$present', '$totalSessions'] }, 100] }, 1],
        },
      },
    },
    { $sort: { attendanceRate: -1, empCode: 1 } },
  ];

  const countPipeline = [...pipeline, { $count: 'total' }];
  const [countResult] = await Attendance.aggregate(countPipeline);
  const total = countResult ? countResult.total : 0;

  const data = await Attendance.aggregate([
    ...pipeline,
    { $skip: skip },
    { $limit: limit },
  ]);

  return { data, total };
};

// By-team step 1: non-deleted teams (+ members) for an optional class scope.
// The Team.aggregate pre-hook auto-injects { isDeleted: { $ne: true } }.
const aggregateTeamsForAnalytics = (scopedClassIds) => {
  const teamPipeline = [];
  if (scopedClassIds) {
    teamPipeline.push({ $match: { classId: { $in: scopedClassIds } } });
  }
  teamPipeline.push({ $project: { _id: 1, name: 1, members: 1 } });
  return Team.aggregate(teamPipeline);
};

// By-team step 2: per-user attendance counters (indexed {userId,status} group).
// `memberIdStrings` are coerced to ObjectId here; `scheduleIds` optionally
// narrows to a Teacher's scope.
const aggregateAttendanceCountsByUser = (memberIdStrings, scheduleIds = null) => {
  const memberIds = memberIdStrings.map((id) => new mongoose.Types.ObjectId(id));
  const match = { userId: { $in: memberIds } };
  if (scheduleIds) match.scheduleId = { $in: scheduleIds };
  return Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
      },
    },
  ]);
};

// Personal stats — single-user rollup. Returns the raw aggregation result row(s).
const aggregateMyStats = (userId) =>
  Attendance.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
      },
    },
  ]);

// Bulk historical-import insert (Phase 5 slice 4, B6) — joins the caller's
// unit-of-work so a failure rolls the schedule + its attendance back together.
const insertAttendanceMany = async (records, tx) => {
  const res = await Attendance.insertMany(records, tx && tx.session ? { session: tx.session } : {});
  return res.length;
};

module.exports = {
  findScheduleForAuthz,
  findScheduleDocById,
  findClassById,
  distinctScheduledIdsForClasses,
  findScheduledForClass,
  findAttendanceBySchedule,
  findAttendanceByUser,
  findAttendanceForSchedules,
  findAttendanceStatusRows,
  bulkWriteAttendance,
  insertAttendanceMany,
  bumpUsersLastActive,
  aggregateByEmployee,
  aggregateTeamsForAnalytics,
  aggregateAttendanceCountsByUser,
  aggregateMyStats,
};
