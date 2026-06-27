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
};
