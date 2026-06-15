const Skill = require('../../models/Skill');
const Certificate = require('../../models/Certificate');
const LearningProgram = require('../../models/LearningProgram');
const User = require('../../models/User');

// All Mongoose access for the skill domain (TMS.update gap #4).

// ── Skill CRUD ────────────────────────────────────────────
const listLive = () => Skill.find({ isDeleted: false }).sort({ category: 1, name: 1 }).lean();
const findById = (id) => Skill.findOne({ _id: id, isDeleted: false }).lean();
// Case-insensitive name match among live skills (uniqueness guard), excludeId for edits.
const findByName = (name, excludeId = null) => {
  const filter = { isDeleted: false, name: new RegExp(`^${escapeRe(name)}$`, 'i') };
  if (excludeId) filter._id = { $ne: excludeId };
  return Skill.findOne(filter).lean();
};
const create = (data) => Skill.create(data);
const updateById = (id, patch) =>
  Skill.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: patch }, { new: true }).lean();
const softDeleteById = (id) =>
  Skill.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } }, { new: true }).lean();

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Completion signal (issued certificates → completed programs) ──
// One certificate per (learner, program) completion. programId can be null on
// legacy/program-less cohorts — those rows are skipped (no program to map).

/** Distinct completed programIds for ONE learner (string ids). */
const completedProgramIdsForUser = async (userId) => {
  const rows = await Certificate.find(
    { userId, status: 'Issued', isDeleted: false, programId: { $ne: null } },
    { programId: 1 },
  ).lean();
  return new Set(rows.map((r) => String(r.programId)));
};

/**
 * Completed programIds for EVERY learner (workforce pass).
 * @returns {Promise<Map<string, Set<string>>>} userId → Set(programId)
 */
const completedProgramIdsByUser = async () => {
  const rows = await Certificate.aggregate([
    { $match: { status: 'Issued', isDeleted: false, programId: { $ne: null } } },
    { $group: { _id: '$userId', programs: { $addToSet: '$programId' } } },
  ]);
  const map = new Map();
  for (const r of rows) map.set(String(r._id), new Set((r.programs || []).map((p) => String(p))));
  return map;
};

/**
 * Distinct certified-holder userIds per program (for Studio coverage bars).
 * @returns {Promise<Map<string, Set<string>>>} programId → Set(userId)
 */
const holdersByProgram = async () => {
  const rows = await Certificate.aggregate([
    { $match: { status: 'Issued', isDeleted: false, programId: { $ne: null } } },
    { $group: { _id: '$programId', users: { $addToSet: '$userId' } } },
  ]);
  const map = new Map();
  for (const r of rows) map.set(String(r._id), new Set((r.users || []).map((u) => String(u))));
  return map;
};

// ── Supporting reads ──────────────────────────────────────
const listUsersWithRole = () => User.find({}, { _id: 1, role: 1 }).lean();
const findUserBasic = (id) => User.findById(id, { _id: 1, name: 1, role: 1, department: 1, empCode: 1 }).lean();
const programNamesByIds = async (ids) => {
  if (!ids || ids.length === 0) return new Map();
  const rows = await LearningProgram.find({ _id: { $in: ids } }, { name: 1 }).lean();
  return new Map(rows.map((r) => [String(r._id), r.name]));
};

module.exports = {
  listLive,
  findById,
  findByName,
  create,
  updateById,
  softDeleteById,
  completedProgramIdsForUser,
  completedProgramIdsByUser,
  holdersByProgram,
  listUsersWithRole,
  findUserBasic,
  programNamesByIds,
};
