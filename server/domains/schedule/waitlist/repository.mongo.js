const WaitlistEntry = require('../../../models/WaitlistEntry');
const Schedule = require('../../../models/Schedule');
const Team = require('../../../models/Team');
const Enrollment = require('../../../models/Enrollment');
const Class = require('../../../models/Class');

// ──────────────────────────────────────────────────────────
// Waitlist repository — MONGO impl (Wave E3 phase-04, slice B;
// split into mongo/pg for the dual-backend port, Phase 3 Wave-D slice S2).
// ──────────────────────────────────────────────────────────
// All Mongoose access for the waitlist sub-domain lives here. The PG twin
// (./repository.pg) mirrors this interface exactly; ./repository selects by
// DB_BACKEND. Default DB_BACKEND=mongo → behaviour unchanged.

const findScheduleForJoin = (id) =>
  Schedule.findById(id)
    .select('status startTime classId bookedTeamId capacity enrolledUsers')
    .lean();

const findTeamMembers = (teamId) =>
  Team.findById(teamId).select('members').lean();

// Active cohort-based enrollment (teamId:null — the cohort-mode audience).
const hasActiveCohortEnrollment = async (classId, userId) =>
  Boolean(await Enrollment.exists({ classId, userId, teamId: null, status: 'Active' }));

// Teacher staff-list scope — own classes; legacy empty teacherIds stays
// permissive (the repo-wide "open until populated" rule).
const isTeacherAllowedForClass = async (classId, teacherId) => {
  const cls = await Class.findById(classId).select('teacherIds').lean();
  if (!cls) return false;
  if (!cls.teacherIds || cls.teacherIds.length === 0) return true;
  return cls.teacherIds.some((t) => String(t) === String(teacherId));
};

// Returns a PLAIN object (toObject) so consumers (controller, positionOf) are
// backend-agnostic — the PG twin returns the same shape. May throw E11000 on the
// partial-unique {scheduleId,userId} where status:'waiting' double-join guard.
const createEntry = async ({ scheduleId, classId, userId, joinedBy }) => {
  const doc = await WaitlistEntry.create({ scheduleId, classId, userId, joinedBy });
  return doc.toObject();
};

const findMyWaitingEntry = (scheduleId, userId) =>
  WaitlistEntry.findOne({ scheduleId, userId, status: 'waiting' }).lean();

// FIFO position: 1 + number of older waiting rows on the same session.
const positionOf = async (entry) =>
  1 + (await WaitlistEntry.countDocuments({
    scheduleId: entry.scheduleId,
    status: 'waiting',
    createdAt: { $lt: entry.createdAt },
  }));

const withdrawMyEntry = (scheduleId, userId) =>
  WaitlistEntry.findOneAndUpdate(
    { scheduleId, userId, status: 'waiting' },
    { $set: { status: 'withdrawn' } },
    { new: true },
  ).lean();

// Staff view: the full queue (all statuses) for one session, oldest first.
const listEntriesForSchedule = (scheduleId) =>
  WaitlistEntry.find({ scheduleId })
    .populate('userId', 'empCode name department')
    .sort({ createdAt: 1 })
    .lean();

// Learner view: my LIVE queue rows across sessions, soonest session first.
const listMyWaitingEntries = (userId) =>
  WaitlistEntry.find({ userId, status: 'waiting' })
    .populate({
      path: 'scheduleId',
      select: 'startTime endTime classId officeId roomId status',
      populate: [
        { path: 'classId', select: 'classCode courseName' },
        { path: 'officeId', select: 'name code' },
        { path: 'roomId', select: 'name code' },
      ],
    })
    .sort({ createdAt: 1 })
    .lean();

// ── FIFO promotion ops (slice S4) — tx-aware (the seat-freeing tx) ──
// Accept BOTH a raw mongoose session (legacy callers: Team.syncSchedulesFor-
// TeamUpdate, use-cases.updateSchedule) AND a UoW { session } wrapper, via the
// same sessionOf shim as the schedule repo (key off .session / .startTransaction,
// NEVER .client — a mongoose ClientSession exposes a .client getter).
const sessionOf = (tx) => {
  if (!tx) return undefined;
  if (tx.session) return tx.session;
  if (typeof tx.startTransaction === 'function') return tx;
  return undefined;
};

const findScheduleForPromotion = async (scheduleId, tx) => {
  const session = sessionOf(tx);
  let q = Schedule.findById(scheduleId).select('status startTime classId capacity enrolledUsers').lean();
  if (session) q = q.session(session);
  const s = await q;
  if (!s) return null;
  return {
    _id: s._id, status: s.status, startTime: s.startTime, classId: s.classId || null,
    capacity: s.capacity == null ? undefined : s.capacity,
    enrolledUsers: (s.enrolledUsers || []).map(String),
  };
};

const findWaitingEntriesForPromotion = async (scheduleId, tx) => {
  const session = sessionOf(tx);
  let q = WaitlistEntry.find({ scheduleId, status: 'waiting' }).sort({ createdAt: 1 }).select('_id userId').lean();
  if (session) q = q.session(session);
  const rows = await q;
  return rows.map((r) => ({ _id: r._id, userId: String(r.userId) }));
};

// THE guarded seat (T-FIFO-push): the conditional $push that a concurrent
// promoter/booking can never overfill. Returns modifiedCount (0 = refused).
const seatWaiterIfRoom = async (scheduleId, userId, cap, tx) => {
  const res = await Schedule.updateOne(
    {
      _id: scheduleId,
      status: 'scheduled',
      enrolledUsers: { $ne: userId },
      $expr: { $lt: [{ $size: '$enrolledUsers' }, cap] },
    },
    { $push: { enrolledUsers: userId } },
    { session: sessionOf(tx) },
  );
  return res.modifiedCount;
};

const findScheduleEnrolledUsers = async (scheduleId, tx) => {
  const session = sessionOf(tx);
  let q = Schedule.findById(scheduleId).select('enrolledUsers').lean();
  if (session) q = q.session(session);
  const s = await q;
  return (s && s.enrolledUsers ? s.enrolledUsers : []).map(String);
};

const markEntryPromoted = (entryId, tx) =>
  WaitlistEntry.updateOne(
    { _id: entryId },
    { $set: { status: 'promoted', promotedAt: new Date() } },
    { session: sessionOf(tx) },
  );

// ── Post-commit promotion notification log (#256) ─────────
// One row per promotion; the model's 7-field unique tuple makes retries
// idempotent — a duplicate insert throws E11000 (the caller treats it as
// "already notified"). Post-commit + fail-soft → no tx handle.
const insertPromotionLog = async ({ scheduleId, userId, recipientEmail }) => {
  const NotificationLog = require('../../../models/NotificationLog');
  const doc = await NotificationLog.create({
    type: 'waitlist_promoted',
    recipientEmail: recipientEmail || '',
    recipientUserId: userId,
    learnerId: userId,
    cadenceKey: `${scheduleId}:${userId}`,
    metadata: { scheduleId: String(scheduleId) },
  });
  return { _id: doc._id };
};

const setPromotionLogStatus = (logId, { status, sentAt = null, error = null }) => {
  const NotificationLog = require('../../../models/NotificationLog');
  const set = { status };
  if (sentAt) set.sentAt = sentAt;
  if (error != null) set.error = error;
  return NotificationLog.updateOne({ _id: logId }, { $set: set });
};

module.exports = {
  findScheduleForJoin,
  findTeamMembers,
  hasActiveCohortEnrollment,
  isTeacherAllowedForClass,
  createEntry,
  findMyWaitingEntry,
  positionOf,
  withdrawMyEntry,
  listEntriesForSchedule,
  listMyWaitingEntries,
  findScheduleForPromotion,
  findWaitingEntriesForPromotion,
  seatWaiterIfRoom,
  findScheduleEnrolledUsers,
  markEntryPromoted,
  insertPromotionLog,
  setPromotionLogStatus,
};
