const RequiredTraining = require('../../models/RequiredTraining');
const User = require('../../models/User');
const Certificate = require('../../models/Certificate');
const LearningProgram = require('../../models/LearningProgram');
const LearningPath = require('../../models/LearningPath');

// ──────────────────────────────────────────────────────────
// compliance/repository — all Mongoose access for A3 (Horizon 1).
// ──────────────────────────────────────────────────────────

// ── RequiredTraining CRUD ────────────────────────────────────────────────────
const createRequirement = (data) => RequiredTraining.create(data);

const listRequirements = () =>
  RequiredTraining.find({}).sort({ createdAt: -1 }).lean();

const findRequirementById = (id) =>
  RequiredTraining.findOne({ _id: id, isDeleted: false }).lean();

const updateRequirement = (id, data) =>
  RequiredTraining.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const softDeleteRequirement = (id) =>
  RequiredTraining.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

// ── Workforce + completion signals ───────────────────────────────────────────
// Active, non-deleted users — the workforce the matrix evaluates. Optionally
// scoped to one department/role for a filtered matrix view.
const listWorkforce = ({ departmentId, role } = {}) => {
  const filter = { status: 'Active' };
  if (role) filter.role = role;
  if (departmentId) filter.departmentId = departmentId;
  return User.find(filter)
    .select('empCode name role department departmentId officeId createdAt')
    .lean();
};

const findUserById = (id) =>
  User.findOne({ _id: id }).select('empCode name role department departmentId officeId createdAt').lean();

// Issued certificates for a set of users × target programs — the "done" signal.
const listIssuedCertificates = ({ userIds, programIds }) => {
  if (!userIds.length || !programIds.length) return [];
  return Certificate.find({
    userId: { $in: userIds },
    programId: { $in: programIds },
    status: 'Issued',
    isDeleted: false,
  })
    .select('userId programId issuedAt')
    .lean();
};

// Names for the matrix labels.
const findProgramsByIds = (ids) =>
  ids.length ? LearningProgram.find({ _id: { $in: ids } }).select('name code').lean() : [];

const findPathsByIds = (ids) =>
  ids.length ? LearningPath.find({ _id: { $in: ids } }).select('title code programs').lean() : [];

module.exports = {
  createRequirement,
  listRequirements,
  findRequirementById,
  updateRequirement,
  softDeleteRequirement,
  listWorkforce,
  findUserById,
  listIssuedCertificates,
  findProgramsByIds,
  findPathsByIds,
};
