const Attendance = require('../../../models/Attendance');
const Schedule = require('../../../models/Schedule');
const Certificate = require('../../../models/Certificate');
const AssessmentAttempt = require('../../../models/AssessmentAttempt');
const Feedback = require('../../../models/Feedback');
const LearningProgram = require('../../../models/LearningProgram');
const Enrollment = require('../../../models/Enrollment');
const User = require('../../../models/User');
const { ATTENDED_STATUSES } = require('../completion/repository');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');

// ──────────────────────────────────────────────────────────
// Dashboard repository — NEW batched aggregations only.
// Completion/program/department rollups are NOT here: the use-case reuses
// reports/completion-rollup-use-case (DRY). Every function takes an optional
// `cohortIds` scope (null = org-wide, array = Teacher-visible cohorts) so the
// same queries serve Admin (unscoped) and Teacher (class-scoped) callers.
// ──────────────────────────────────────────────────────────

const DAY_MS = 86400000;

const cohortScope = (cohortIds, field = 'cohortId') =>
  cohortIds ? { [field]: { $in: cohortIds } } : {};

// Schedules of the scoped cohorts — used to scope attendance records.
const scheduleIdsForCohorts = (cohortIds) =>
  Schedule.distinct('_id', { classId: { $in: cohortIds } });

// Attendance totals: present uses the completion engine's ATTENDED_STATUSES
// (P|L) so the dashboard rate matches completion/attendance reporting.
const attendanceTotals = async (cohortIds) => {
  const pipeline = [];
  if (cohortIds) {
    const scheduleIds = await scheduleIdsForCohorts(cohortIds);
    if (!scheduleIds.length) return { totalRecords: 0, presentRecords: 0 };
    pipeline.push({ $match: { scheduleId: { $in: scheduleIds } } });
  }
  pipeline.push({
    $group: {
      _id: null,
      total: { $sum: 1 },
      present: { $sum: { $cond: [{ $in: ['$status', ATTENDED_STATUSES] }, 1, 0] } },
    },
  });
  const [row] = await Attendance.aggregate(pipeline);
  return { totalRecords: row?.total || 0, presentRecords: row?.present || 0 };
};

// Session counts split around "now" (upcoming / next 7 days / past).
const sessionCounts = async (cohortIds, now) => {
  const base = cohortScope(cohortIds, 'classId');
  const in7Days = new Date(now.getTime() + 7 * DAY_MS);
  const [upcoming, next7Days, past] = await Promise.all([
    Schedule.countDocuments({ ...base, startTime: { $gt: now } }),
    Schedule.countDocuments({ ...base, startTime: { $gt: now, $lte: in7Days } }),
    Schedule.countDocuments({ ...base, endTime: { $lt: now } }),
  ]);
  return { upcoming, next7Days, past };
};

// Issued certificates with a validity window, bucketed by proximity to expiry.
// Day-level boundaries: expired = validUntil < now; expiring30/60 = within
// now..now+30/60 days (the D6 per-row state helper stays the row-level truth).
const certificateExpiryCounts = async (cohortIds, now) => {
  const base = { status: 'Issued', isDeleted: false, ...cohortScope(cohortIds) };
  const d30 = new Date(now.getTime() + 30 * DAY_MS);
  const d60 = new Date(now.getTime() + 60 * DAY_MS);
  const [expired, expiring30, expiring60] = await Promise.all([
    Certificate.countDocuments({ ...base, validUntil: { $ne: null, $lt: now } }),
    Certificate.countDocuments({ ...base, validUntil: { $gte: now, $lte: d30 } }),
    Certificate.countDocuments({ ...base, validUntil: { $gte: now, $lte: d60 } }),
  ]);
  return { expired, expiring30, expiring60 };
};

// Soonest-expiring Issued certificates. learnerName/programName are immutable
// snapshots frozen on the Certificate at issue time — no populate needed.
const listExpiringCertificates = (cohortIds, now, horizon, limit) =>
  Certificate.find({
    status: 'Issued',
    isDeleted: false,
    validUntil: { $gte: now, $lte: horizon },
    ...cohortScope(cohortIds),
  })
    .select('certificateNumber learnerName programName validUntil userId programId')
    .sort({ validUntil: 1 })
    .limit(limit)
    .lean();

// Attempt-level pass totals (every submitted attempt counts, not per-learner).
const assessmentTotals = async (cohortIds) => {
  const [row] = await AssessmentAttempt.aggregate([
    { $match: { isDeleted: false, ...cohortScope(cohortIds) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        passed: { $sum: { $cond: ['$passed', 1, 0] } },
      },
    },
  ]);
  return { totalAttempts: row?.total || 0, passedAttempts: row?.passed || 0 };
};

// Overall average rating + top programs by feedback volume (programId is
// denormalised onto Feedback at submit precisely for this kind of rollup).
const feedbackStats = async (cohortIds) => {
  const match = { isDeleted: false, ...cohortScope(cohortIds) };
  const [overallRows, byProgram] = await Promise.all([
    Feedback.aggregate([
      { $match: match },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
    ]),
    Feedback.aggregate([
      { $match: { ...match, programId: { $ne: null } } },
      { $group: { _id: '$programId', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);
  const overall = overallRows[0] || { count: 0, avg: null };
  return { overall: { count: overall.count, avg: overall.avg }, byProgram };
};

const listProgramNames = (programIds) =>
  programIds.length
    ? LearningProgram.find({ _id: { $in: programIds } }).select('name').lean()
    : [];

// Training coverage (org-wide by design — counts only, no resource access):
// engaged = active Participants with an attendance record OR a still-active
// enrollment created inside the window; denominator = all active Participants.
const coverageCounts = async (windowStart) => {
  const activeParticipantFilter = {
    role: 'Participant',
    status: 'Active',
    isDeleted: { $ne: true },
  };
  const [activeParticipants, attendedIds, enrolledIds] = await Promise.all([
    User.countDocuments(activeParticipantFilter),
    Attendance.distinct('userId', { createdAt: { $gte: windowStart } }),
    Enrollment.distinct('userId', {
      createdAt: { $gte: windowStart },
      status: { $in: ACTIVE_ENROLLMENT_STATUSES },
    }),
  ]);
  const engagedIds = [...new Set([...attendedIds, ...enrolledIds].map(String))];
  const engagedParticipants = engagedIds.length
    ? await User.countDocuments({ ...activeParticipantFilter, _id: { $in: engagedIds } })
    : 0;
  return { activeParticipants, engagedParticipants };
};

module.exports = {
  attendanceTotals,
  sessionCounts,
  certificateExpiryCounts,
  listExpiringCertificates,
  assessmentTotals,
  feedbackStats,
  listProgramNames,
  coverageCounts,
};
