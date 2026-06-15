const mongoose = require('mongoose');
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

const findTeamDocById = (id) => Team.findById(id); // live doc (needs .name etc.)

const findDeletedTeamById = (id) =>
  Team.findOne({ _id: id, isDeleted: true }).lean();

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

const insertTeam = (doc, session) => Team.create([doc], { session });

const updateTeamDoc = (id, data, session) =>
  Team.findOneAndUpdate({ _id: id }, data, { new: true, runValidators: true, session });

const unassignTeamClass = (teamId) =>
  Team.findByIdAndUpdate(teamId, { $set: { classId: null } });

const pullTeamMember = (teamId, userId, session) =>
  Team.findByIdAndUpdate(teamId, { $pull: { members: userId } }, { session: session || undefined });

// Soft-delete flips go through the RAW driver collection on purpose: the
// model's pre-find hook auto-filters isDeleted, so a Mongoose update couldn't
// re-find a deleted doc to restore it.
const markTeamDeleted = (teamId, session) =>
  Team.collection.updateOne(
    { _id: teamId },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { session },
  );

const markTeamRestored = (id) =>
  Team.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { isDeleted: false, deletedAt: null } },
  );

// ── Enrollment writes/reads (lifecycle + enrollment-sync) ─

const closeActiveEnrollments = (teamId, session) =>
  Enrollment.updateMany(
    { teamId, status: 'Active' },
    { $set: { status: 'Dropped', leftAt: new Date() } },
    { session },
  );

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
  findTeamDocById,
  findDeletedTeamById,
  findTeamByClass,
  findTeamByClassExcluding,
  findTeamsByMembers,
  // team writes
  insertTeam,
  updateTeamDoc,
  unassignTeamClass,
  pullTeamMember,
  markTeamDeleted,
  markTeamRestored,
  // enrollment
  closeActiveEnrollments,
  findTeamForEnrollmentContext,
  findActiveEnrollmentInOtherTeam,
  findActiveEnrollmentInTeam,
  saveEnrollment,
  // user
  findUserContact,
};
