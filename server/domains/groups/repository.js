const Team = require('../../models/Team');
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

// ── Moved to dual-backend seams (Wave-D groups port) ──────
// slice 1 → ./lifecycle-repository (soft-delete cascade: markTeamDeleted /
//   markTeamRestored / closeActiveEnrollments + their pre-reads);
// slice 2 → ./team-write-repository (insertTeam / updateTeamDoc /
//   unassignTeamClass + the member-array ⇄ team_members junction bridge);
// slice 3 → ./enrollment-sync-repository (findTeamForEnrollmentContext /
//   findActiveEnrollmentInOtherTeam / transferEnrollment / findActiveEnrollmentInTeam /
//   dropEnrollment / pullTeamMember / findUserContact — the live-doc `.save()`
//   transfer/drop became explicit updates on the unit-of-work boundary).
// This module now keeps the remaining Mongo-only READ surface (team lists /
// single reads / mutation guards / the schedule-roster sync re-export).

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
};
