const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');
const User = require('../../models/User');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
// Schedule-roster sync helper lives on the Team model module; re-exported here
// so callers reach it through the repository rather than importing the model.
const { syncSchedulesForTeamUpdate } = require('../../models/Team');

// ──────────────────────────────────────────────────────────
// groups/repository — the single home for every Mongoose call in this domain
// (audit round 9: model access consolidated out of queries / mutations /
// lifecycle / enrollment-sync). Behaviour preserved 1:1 — same filters,
// projections, populate, lean, sort, transaction-session passthrough, raw
// `Team.collection` soft-delete writes, and document `.save()` semantics.
// ──────────────────────────────────────────────────────────

// ── Team list reads (queries.getTeams) ────────────────────
// Shared populate shape for the list endpoints. `slim` skips the heavy members
// populate (API-002: the "1000 teams × 9 members" payload problem).
const teamListBaseQuery = (slim) => {
  let q = Team.find()
    .populate('classId', 'classCode courseName status')
    .populate('leaderId', 'empCode name department status');
  if (!slim) q = q.populate('members', 'empCode name department status');
  return q.sort({ name: 1 });
};

const findTeamsPage = ({ slim, skip, limit }) =>
  teamListBaseQuery(slim).skip(skip).limit(limit);

const findAllTeams = ({ slim }) => teamListBaseQuery(slim);

const countTeams = () => Team.countDocuments();

// ── Single-team reads ─────────────────────────────────────

// Full populate — shared by getTeamById and the post-write reads in mutations.
const findTeamByIdPopulated = (id) =>
  Team.findById(id)
    .populate('classId', 'classCode courseName status')
    .populate('leaderId', 'empCode name department status')
    .populate('members', 'empCode name department status');

// getMyTeams — nested program.schedulingMode for client-side cell gating.
const findTeamsForUser = (userId) =>
  Team.find({ $or: [{ leaderId: userId }, { members: userId }] })
    .populate({
      path: 'classId',
      select: 'classCode courseName status programId',
      populate: { path: 'programId', select: 'schedulingMode' },
    })
    .populate('leaderId', 'empCode name department status')
    .populate('members', 'empCode name department status')
    .sort({ name: 1 });

const findDeletedTeams = () =>
  Team.find({ isDeleted: true })
    .populate('classId', 'classCode courseName')
    .populate('leaderId', 'empCode name')
    .sort({ deletedAt: -1 })
    .lean();

// getTeamProgress — team + its live sessions + their attendance rows.
const findTeamForProgress = (teamId) =>
  Team.findById(teamId)
    .populate('members', 'empCode name department status')
    .populate('classId', 'classCode courseName')
    .lean();

const findTeamScheduledSessions = (teamId) =>
  Schedule.find({ bookedTeamId: teamId, status: 'scheduled' })
    .sort({ startTime: 1 }).lean();

const findAttendanceForSchedules = (scheduleIds) =>
  Attendance.find({ scheduleId: { $in: scheduleIds } }).lean();

// ── Mutations: pre-write reads + conflict guards ──────────

const findTeamByIdLean = (id) => Team.findById(id).lean();

// "1 team per class" guard — the team currently holding a class (if any).
const findTeamByClass = (classId) =>
  Team.findOne({ classId }).populate('classId', 'classCode').lean();

const findTeamByClassExcluding = (classId, excludeId) =>
  Team.findOne({ classId, _id: { $ne: excludeId } })
    .populate('classId', 'classCode').lean();

// "1 team per member" guard — teams that already hold any of the members.
const findTeamsByMembers = (memberIds, excludeTeamId = null) => {
  const query = { members: { $in: memberIds } };
  if (excludeTeamId) query._id = { $ne: excludeTeamId };
  return Team.find(query).populate('members', 'name empCode').lean();
};

// ── Team writes ───────────────────────────────────────────
// insertTeam / updateTeamDoc / unassignTeamClass moved to
// ./team-write-repository (dual-backend groups slice 2 — the member-array ⇄
// team_members junction bridge). pullTeamMember stays here until the
// enrollment-sync slice (it shares the transfer close-path).

const pullTeamMember = (teamId, userId, session) =>
  Team.findByIdAndUpdate(teamId, { $pull: { members: userId } }, { session: session || undefined });

// ── Enrollment writes/reads (enrollment-sync) ─
// The soft-delete lifecycle writes (markTeamDeleted / markTeamRestored /
// closeActiveEnrollments) + their pre-reads (findTeamDocById /
// findDeletedTeamById) moved to ./lifecycle-repository — the dual-backend
// groups slice 1 (runs on the _shared/unit-of-work transaction boundary).

// In-session lean team read for email context (sees same-tx team writes).
const findTeamForEnrollmentContext = (teamId, session) =>
  Team.findById(teamId)
    .populate('classId', 'classCode courseName')
    .session(session || null)
    .lean();

// Live Enrollment docs (non-lean) so the caller can mutate + save() them,
// preserving the model's pre-save hooks/validators exactly.
const findActiveEnrollmentInOtherTeam = (userId, teamId, session) =>
  Enrollment.findOne({ userId, status: 'Active', teamId: { $ne: teamId } })
    .populate('teamId', 'name')
    .session(session || null);

const findActiveEnrollmentInTeam = (userId, teamId, session) =>
  Enrollment.findOne({ userId, teamId, status: 'Active' }).session(session || null);

const saveEnrollment = (doc, session) => doc.save({ session: session || undefined });
// NOTE: Active-enrollment CREATE moved to the shared write spine
// (domains/learning/enrollment/writes → repository.insertActiveEnrollment) so
// team-create and cohort-create converge (Phase 2). This repo keeps the
// team-specific enrollment READS + close/transfer save only.

// ── User ──────────────────────────────────────────────────

const findUserContact = (userId) =>
  User.findById(userId).select('name email').lean();

module.exports = {
  syncSchedulesForTeamUpdate,
  // list reads
  findTeamsPage,
  findAllTeams,
  countTeams,
  // single reads
  findTeamByIdPopulated,
  findTeamsForUser,
  findDeletedTeams,
  findTeamForProgress,
  findTeamScheduledSessions,
  findAttendanceForSchedules,
  // mutation pre-reads / guards
  findTeamByIdLean,
  findTeamByClass,
  findTeamByClassExcluding,
  findTeamsByMembers,
  // team writes
  pullTeamMember,
  // enrollment
  findTeamForEnrollmentContext,
  findActiveEnrollmentInOtherTeam,
  findActiveEnrollmentInTeam,
  saveEnrollment,
  // user
  findUserContact,
};
