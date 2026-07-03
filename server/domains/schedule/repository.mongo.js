const mongoose = require('mongoose');
const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const Attendance = require('../../models/Attendance');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const User = require('../../models/User');
const WaitlistEntry = require('../../models/WaitlistEntry');
const Setting = require('../../models/Setting');
const Room = require('../../models/Room');
const RoomBooking = require('../../models/RoomBooking');
const { COHORT_SCHEDULING_MODES } = require('../_shared/scheduling-modes');

// ──────────────────────────────────────────────────────────
// schedule/repository — MONGO impl (Phase 3 Wave-D dual-backend port).
// Verbatim of the pre-port repository.js. The PURE READS are mirrored by
// ./repository.pg (slice S1); slice S3a additionally mirrors the 12 booking/
// cancel/room-lock/waitlist/mode/capacity/attendance txn methods. The 2 remaining
// orchestration-coupled writes (updateScheduleById generic field-mapper +
// findTeamById opts-session) stay Mongo until slice S3b — the selector merges
// mongo ⊕ pg so an un-ported method falls back here. ./repository resolves by DB_BACKEND.
// ──────────────────────────────────────────────────────────

// Transaction handle normaliser (slice S3a). The dual-backend convention threads
// a Unit-of-Work wrapper ({ session } on mongo, { client } on pg). These methods
// ALSO have legacy callers (scheduleService / use-cases reassign / policies /
// Team-sync) that still pass a RAW mongoose ClientSession positionally — so the
// mongo impl accepts BOTH. NB: a mongoose ClientSession exposes a `.client`
// getter, so we must NOT discriminate on `.client`; key off `.session` (wrapper)
// then the `.startTransaction` duck-type (raw session). Anything else → no session.
const sessionOf = (tx) => {
  if (!tx) return undefined;
  if (tx.session) return tx.session;                        // { session } UoW wrapper
  if (typeof tx.startTransaction === 'function') return tx; // raw mongoose ClientSession
  return undefined;                                         // { client } (pg, unused here) / {} / undefined
};

// ── Schedule ──────────────────────────────────────────────

const findScheduleById = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name department status');

const findScheduleByIdRaw = (id) => Schedule.findById(id);

// ── Post-commit re-fetch reads (read-path completion) ─────
// scheduleService re-fetches the populated Schedule for its booking/cancel
// responses + notifications. These were the last Mongo-direct reads in the
// chokepoint; routing them here lets DB_BACKEND=postgres run booking end-to-end.
// Each mirrors the legacy populate/lean shape exactly (behaviour preserved 1:1).

// bookSlot / bookCohortSlot / adminCreate response. NON-lean on purpose: the
// res.json serialisation applies the Schedule toJSON virtuals (enrolledCount /
// availableSpots) — the legacy re-fetch was non-lean too, so the response shape
// is preserved 1:1. (bookCohortSlot has no team → bookedTeamId populates null.)
const findScheduleForResponse = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name');

// cancelSlot load — class label + enrolled-user emails for the cancellation
// notifications. bookedTeamId stays RAW (leader-auth loads the team separately
// via findTeamLeaderId). Lean: used only for field reads + auth, never serialised.
const findScheduleForCancellation = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('enrolledUsers', 'name email')
    .lean();

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
// NOTE (BUG-003): plain `.lean()` — the `{ virtuals: true }` option only works
// with the mongoose-lean-virtuals plugin, which is NOT installed, so it was a
// silent no-op. The enrolledCount virtual is attached explicitly in
// queries.listSchedules from the populated enrolledUsers array.
const findSchedulesPage = (query, { skip, limit }) =>
  Schedule.find(query)
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name department')
    .sort({ startTime: 1 })
    .skip(skip).limit(limit)
    .lean();

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

const updateScheduleById = (id, data, tx) => {
  const session = sessionOf(tx);
  return Schedule.findByIdAndUpdate(id, data, {
    new: true, runValidators: true, ...(session && { session }),
  });
};

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

// NOTE (DATA-015, audit round 2): the old hard-delete helpers
// (deleteScheduleById / deleteAttendanceByScheduleId) were removed — durable
// cancellation replaced every caller, and keeping them invited accidental
// reuse that would break the cancel-is-history + attendance golden rules.

// ── Durable cancellation (Wave E3 phase-04, slice A) ──────
// Atomic conditional flip: matches only a LIVE doc, so two concurrent cancels
// resolve as one winner (doc returned) and one loser (null → caller 409s).
// roomId is nulled in the same write — the caller releases the RoomBooking
// ledger row in the same tx, and field + ledger must never drift (B3).
const cancelScheduleById = (id, { cancelledBy = null, cancelReason = '' } = {}, tx) => {
  const session = sessionOf(tx);
  return Schedule.findOneAndUpdate(
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
};

// ── Attendance ────────────────────────────────────────────

const attendanceExistsForSchedule = (scheduleId, tx) => {
  const session = sessionOf(tx);
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
  const session = sessionOf(opts.session);
  if (session) q = q.session(session);
  return q;
};

// cancelSlot leader-auth — minimal team-leader lookup (read-path completion).
// The Team soft-delete pre-find hook hides deleted teams, matching the pg
// `is_deleted = false` predicate.
const findTeamLeaderId = (teamId) =>
  Team.findById(teamId).select('leaderId').lean();

// Booking team load (slice S3b-1) — replaces the in-tx Team write-lock + populate
// in scheduleService (bookSlot lock:true, adminCreate lock:false). lock:true
// serializes concurrent same-team bookings via the Mongo `findByIdAndUpdate
// {updatedAt}` write trick (pg twin uses SELECT … FOR UPDATE). Returns a plain
// shape {_id, classId, leaderId, members:[{_id,status}]} so callers stay
// backend-agnostic. members soft-delete-dropped via populate.
const loadTeamForBooking = async (teamId, tx, { lock = false } = {}) => {
  const session = sessionOf(tx);
  let q = lock
    ? Team.findByIdAndUpdate(teamId, { $set: { updatedAt: new Date() } }, { new: true })
    : Team.findById(teamId);
  q = q.populate('members', '_id status');
  if (session) q = q.session(session);
  const t = await q;
  if (!t) return null;
  return {
    _id: t._id,
    classId: t.classId || null,
    leaderId: t.leaderId || null,
    members: (t.members || []).map((m) => ({ _id: m._id, status: m.status })),
  };
};

// ── Composite queries (used by use-cases) ─────────────────

// Only LIVE sessions collide — a durable-cancelled row frees its slot
// (mirrors the partial-unique index, which is scoped the same way).
const findScheduleForCollision = (classId, start, end, excludeId, tx) => {
  const session = sessionOf(tx);
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

// A6 (Horizon 2) — trainer double-booking guard. A LIVE session (≠ excludeId)
// that names ANY of these instructors and overlaps [start,end]. Mirrors the
// collision query's time-overlap + status:'scheduled' scoping.
const findInstructorConflict = (instructorIds, start, end, excludeId) => {
  if (!instructorIds || instructorIds.length === 0) return Promise.resolve(null);
  const query = {
    sessionInstructorIds: { $in: instructorIds },
    startTime: { $lt: end },
    endTime: { $gt: start },
    status: 'scheduled',
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Schedule.findOne(query).select('_id classId startTime endTime sessionInstructorIds').lean();
};

// Cancelled sessions don't consume the team's weekly quota.
const countSchedulesForTeamInWeek = (teamId, weekStart, weekEnd, excludeId, tx) => {
  const session = sessionOf(tx);
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
const findClassSchedulingMode = async (classId, tx) => {
  const session = sessionOf(tx);
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

// ── Scheduling-world resolution (English-class separation) ─
// The platform splits list reads into two worlds: cohort world = classes whose
// program schedulingMode is self_enroll|nomination; TEAM world = everything
// else, INCLUDING program-less legacy classes (fallback 'leader_booking' —
// same rule as findClassSchedulingMode above). Callers turn the returned ids
// into `classId: {$in: ids}` (cohort) or `{$nin: ids}` (team — $nin also
// matches null/missing programId classes, which is exactly the fallback).
// COHORT_SCHEDULING_MODES is imported from the single source of truth
// (domains/_shared/scheduling-modes) — no longer duplicated here.
const findCohortModeClassIds = async () => {
  const programs = await LearningProgram.find(
    { schedulingMode: { $in: COHORT_SCHEDULING_MODES } },
  ).select('_id').lean();
  if (programs.length === 0) return [];
  const classes = await Class.find(
    { programId: { $in: programs.map((p) => p._id) } },
  ).select('_id').lean();
  return classes.map((c) => c._id);
};

// ── Capacity-policy resolution (Wave E2) ──────────────────
// Resolve a class/cohort's program capacity policy: Class.programId ->
// LearningProgram.capacityPolicy. Returns {} for a program-less class (the
// "open until populated" rule) so such classes fall back to the per-session
// Schedule.capacity field. Mirrors findClassSchedulingMode.
const findClassCapacityPolicy = async (classId, tx) => {
  const session = sessionOf(tx);
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

// ── Model-access consolidation (audit round 9) ────────────
// The reads/writes below used to live directly in this domain's controller,
// policy and helper files. They are gathered here so every collection touch
// goes through the repository (domain convention: no Mongoose outside repo).
// Behaviour is preserved 1:1 — same filters, projections, populate and lean.

const findScheduleByIdLean = (id) => Schedule.findById(id).lean();

// session-order: live sessions of the given classes, ordered, minimal fields.
// Accepts string ids and builds the ObjectIds here so the caller never has to
// touch mongoose. Durable-cancelled rows never consume a session number.
const findScheduledByClassIdsOrdered = (classIds) => {
  const objectIds = classIds.map((id) => new mongoose.Types.ObjectId(id));
  return Schedule.find({ classId: { $in: objectIds }, status: 'scheduled' })
    .select('_id classId startTime')
    .sort({ startTime: 1 })
    .lean();
};

// use-cases: post-commit calendar-sync populate shape (lean).
const findScheduleForCalendarSync = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name email')
    .populate('sessionInstructorIds', 'empCode name email')
    .lean();

// use-cases: minimal class label for a cancellation email.
const findScheduleClassLabel = (id) =>
  Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .select('classId')
    .lean();

const findUsersForEmail = (userIds) =>
  User.find({ _id: { $in: userIds } }).select('name email').lean();

// ── Waitlist (release-resources) ──────────────────────────
const findWaitingEntries = (scheduleIds, tx) =>
  WaitlistEntry.find(
    { scheduleId: { $in: scheduleIds }, status: 'waiting' },
    { userId: 1 },
    { session: sessionOf(tx) },
  ).lean();

const cancelWaitingEntries = (scheduleIds, tx) =>
  WaitlistEntry.updateMany(
    { scheduleId: { $in: scheduleIds }, status: 'waiting' },
    { $set: { status: 'cancelled' } },
    { session: sessionOf(tx) },
  );

// ── Settings (scheduling-window-policy) ───────────────────
const findAllowedTimeSlotsSetting = () =>
  Setting.findOne({ key: 'ALLOWED_TIME_SLOTS' }).lean();

// ── Facilitator policy reads (assignment + visibility) ────
const findClassForFacilitator = (classId) =>
  Class.findById(classId).select('programId teacherIds').lean();

const findProgramFacilitatorPolicy = (programId) =>
  LearningProgram.findById(programId).select('facilitatorPolicy').lean();

const findClassProgramId = (cohortId) =>
  Class.findById(cohortId).select('programId').lean();

const findProgramVisibility = (programId) =>
  LearningProgram.findById(programId).select('facilitatorPolicy.visibility').lean();

const findClassesProgramIds = (cohortIds) =>
  Class.find({ _id: { $in: cohortIds } }).select('programId').lean();

const findAssignedOnlyPrograms = (programIds) =>
  LearningProgram.find({
    _id: { $in: programIds },
    'facilitatorPolicy.visibility': 'assigned_only',
  }).select('_id').lean();

// ── Room-lock ledger (room-lock-policy) ───────────────────
// Raw collection touches only — the duplicate-key→409 and same-Office
// invariants stay in room-lock-policy (business rules); the writes live here.
const findRoomForLock = (roomId, tx) => {
  const session = sessionOf(tx);
  let q = Room.findById(roomId).select('officeId isActive');
  if (session) q = q.session(session);
  return q;
};

const createRoomBooking = ({ roomId, scheduleId, classId, startTime }, tx) =>
  RoomBooking.create([{ roomId, scheduleId, classId, startTime }], { session: sessionOf(tx) });

const setScheduleRoom = (scheduleId, roomId, tx) =>
  Schedule.updateOne({ _id: scheduleId }, { $set: { roomId } }, { session: sessionOf(tx) });

const deleteRoomBookings = (scheduleIds, tx) => {
  const session = sessionOf(tx);
  return RoomBooking.deleteMany(
    { scheduleId: { $in: scheduleIds } },
    ...(session ? [{ session }] : []),
  );
};

module.exports = {
  findScheduleById,
  findScheduleByIdRaw,
  findScheduleForResponse,
  findScheduleForCancellation,
  findTeamLeaderId,
  findScheduleByIdLean,
  findScheduledByClassIdsOrdered,
  findScheduleForCalendarSync,
  findScheduleClassLabel,
  findUsersForEmail,
  findWaitingEntries,
  cancelWaitingEntries,
  findAllowedTimeSlotsSetting,
  findClassForFacilitator,
  findProgramFacilitatorPolicy,
  findClassProgramId,
  findProgramVisibility,
  findClassesProgramIds,
  findAssignedOnlyPrograms,
  findRoomForLock,
  createRoomBooking,
  setScheduleRoom,
  deleteRoomBookings,
  updateScheduleById,
  cancelScheduleById,
  attendanceExistsForSchedule,
  findTeamById,
  loadTeamForBooking,
  findScheduleForCollision,
  findInstructorConflict,
  countSchedulesForTeamInWeek,
  findClassSchedulingMode,
  findClassCapacityPolicy,
  findCohortModeClassIds,
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
