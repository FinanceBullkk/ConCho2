const { todayVN } = require('../../helpers/dayjsConfig');
const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./repository');
const { attachSessionNumbers } = require('./session-order');

// ──────────────────────────────────────────────────────────
// Schedule read/query use-cases
// ──────────────────────────────────────────────────────────
// Extracted from the legacy scheduleService (Phase 1 modular-monolith
// refactor). Pure reads — no transactions, no calendar/email side effects,
// no audit. All Mongoose access goes through repository.js; sessionNumber
// derivation goes through session-order.js. scheduleService re-exports these
// for backward compatibility, so callers are unchanged.

/**
 * Return midnight today in Vietnam timezone (as UTC Date for MongoDB).
 * Example: 23:30 VN May 2 → returns 17:00 UTC May 1 (= 00:00 VN May 2)
 */
const utcToday = () => todayVN();

/**
 * Get future schedules (availability view).
 * @param {Object} filters  { classId? }
 */
const getAvailability = (filters = {}) =>
  repository.findAvailabilitySchedules({ classId: filters.classId, fromDate: utcToday() });

/**
 * Get schedules with filters and pagination.
 */
const listSchedules = async (filters, { page, limit, skip }) => {
  const query = {};
  if (filters.classId) query.classId = filters.classId;

  // Durable cancellation (phase-04 slice A): every list is LIVE-only by
  // default — the admin grid renders rows as occupied cells, so a cancelled
  // row would make the freed slot look taken. Staff may explicitly request
  // history via ?status=cancelled|all.
  if (filters.status === 'cancelled') query.status = 'cancelled';
  else if (filters.status !== 'all') query.status = 'scheduled';

  // Used by Participant scope (BUG #2 fix): restrict to schedules where
  // the user is enrolled. Multikey index on enrolledUsers makes this cheap.
  // Learners NEVER see cancelled rows regardless of the status param (NF3).
  if (filters.enrolledUser) {
    query.enrolledUsers = filters.enrolledUser;
    query.status = 'scheduled';
  }
  if (filters.from || filters.to) {
    query.startTime = {};
    if (filters.from) query.startTime.$gte = new Date(filters.from);
    if (filters.to) query.startTime.$lte = new Date(filters.to);
  }

  const [schedules, total] = await Promise.all([
    repository.findSchedulesPage(query, { skip, limit }),
    repository.countSchedules(query),
  ]);

  await attachSessionNumbers(schedules);
  // BUG-003 (audit round 3): enrolledCount is a Mongoose virtual; `.lean()`
  // strips it (mongoose-lean-virtuals isn't installed, so the repo's
  // `.lean({ virtuals: true })` was a silent no-op). The admin Schedule grid
  // reads s.enrolledCount → rendered "/9" + a 0% bar. Attach it explicitly
  // from the populated array (mirrors getAttendanceCalendar at line ~155).
  schedules.forEach((s) => {
    s.enrolledCount = Array.isArray(s.enrolledUsers) ? s.enrolledUsers.length : 0;
  });
  return { schedules, total };
};

/**
 * Get a single schedule by ID (populated).
 */
const getById = async (id) => {
  const schedule = await repository.findScheduleById(id);
  if (!schedule) throw new ServiceError('Schedule not found', 404);
  return schedule;
};

/**
 * Get upcoming schedules for a participant's team/class.
 */
const getMyClassSchedules = async (userId) => {
  const teams = await repository.findTeamsByMember(userId);
  if (teams.length === 0) return { schedules: [], team: null, leader: null };

  const team = teams[0];
  const leader = team?.leaderId || null;

  const classIds = teams.map(t => t.classId).filter(Boolean);
  if (classIds.length === 0) return { schedules: [], team: team?.name, leader };

  const schedules = await repository.findUpcomingForClasses(classIds, utcToday(), 20);
  await attachSessionNumbers(schedules);
  return { schedules, team: team?.name, leader };
};

/**
 * Get schedules with pre-computed attendance status for the calendar view.
 * Returns schedules with a reliable status field.
 *
 * @param {Object} opts
 * @param {Date|string} opts.from  Optional start date filter
 * @param {Date|string} opts.to    Optional end date filter
 *
 * Status logic:
 *   "none"    — enrolledCount === 0 (no students registered)
 *   "pending" — enrolledCount > 0 but 0 attendance records
 *   "partial" — some attendance marked but count < enrolledCount
 *   "done"    — attendance count >= enrolledCount
 */
const getAttendanceCalendar = async ({ from, to } = {}, requestUser = null) => {
  // Step 1: Build filter (optional date range for performance)
  const filter = {};
  if (from || to) {
    filter.startTime = {};
    if (from) filter.startTime.$gte = new Date(from);
    if (to) filter.startTime.$lte = new Date(to);
  }

  // Teachers see classes they are assigned to (empty teacherIds keeps the
  // legacy graceful-migration behaviour used by attendance/evaluation policy)
  // PLUS sessions where they are a NAMED instructor (Wave E polish — a
  // trainer-only teacher must find the session they will mark attendance for;
  // parity with policy/sessionInstructors which already lets them mark it).
  if (requestUser?.role === 'Teacher') {
    const classIds = await repository.findTeacherScopedClassIds(requestUser._id);
    filter.$or = [
      { classId: { $in: classIds.map((c) => c._id) } },
      { sessionInstructorIds: requestUser._id },
    ];
  }

  const schedules = await repository.findCalendarSchedules(filter);
  if (schedules.length === 0) return [];

  // Step 2: Attach session numbers
  await attachSessionNumbers(schedules);

  // Step 3: Batch-count attendance records per schedule (single aggregation)
  const scheduleIds = schedules.map(s => s._id);
  const attCounts = await repository.aggregateAttendanceCounts(scheduleIds);
  const countMap = {};
  attCounts.forEach(a => { countMap[a._id.toString()] = a.count; });

  // Step 4: Compute status for each schedule
  return schedules.map(s => {
    const enrolled = (s.enrolledUsers || []).length;
    const marked = countMap[s._id.toString()] || 0;

    let attendanceStatus;
    if (enrolled === 0) {
      attendanceStatus = 'none';    // No students → grey
    } else if (marked === 0) {
      attendanceStatus = 'pending'; // Has students, no attendance yet
    } else if (marked < enrolled) {
      attendanceStatus = 'partial'; // Some but not all
    } else {
      attendanceStatus = 'done';    // All marked
    }

    return { ...s, enrolledCount: enrolled, attendanceStatus, markedCount: marked };
  });
};

module.exports = {
  getAvailability,
  listSchedules,
  getById,
  getMyClassSchedules,
  getAttendanceCalendar,
};
