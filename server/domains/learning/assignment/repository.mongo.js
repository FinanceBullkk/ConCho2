// learning/assignment/repository — MONGO impl (Phase 3 Wave-B port).
// Verbatim of the pre-port repository.js: Mongoose calls behind the same
// interface ./repository.pg mirrors. Resolved via ./repository (DB_BACKEND).
const Assignment = require('../../../models/Assignment');
const Class = require('../../../models/Class');
const Department = require('../../../models/Department');
const Enrollment = require('../../../models/Enrollment');
const LearningPath = require('../../../models/LearningPath');
const LearningProgram = require('../../../models/LearningProgram');
const User = require('../../../models/User');

const PARTICIPATING_STATUSES = ['Active', 'On-hold', 'Completed'];
const ASSIGNABLE_USER_STATUSES = ['Active', 'On-hold', 'Waiting for class'];

const populateAssignment = (query) => query
  .populate('programId', 'code name category status')
  .populate('pathId', 'code title status programs')
  .populate('userIds', 'empCode name email department departmentId status')
  .populate('departmentIds', 'code name');

const create = async (data) => {
  const doc = await Assignment.create(data);
  return findById(doc._id);
};

const findById = (id) =>
  populateAssignment(Assignment.findOne({ _id: id, isDeleted: false })).lean();

const list = ({ status = 'active', targetType } = {}) => {
  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (targetType) filter.targetType = targetType;
  return populateAssignment(Assignment.find(filter))
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();
};

const archive = (id) =>
  populateAssignment(Assignment.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { status: 'archived', isDeleted: true, deletedAt: new Date() } },
    { new: true },
  )).lean();

const findProgram = (id) =>
  LearningProgram.findOne({ _id: id, status: { $ne: 'archived' } }).select('_id').lean();

const findPath = (id) =>
  LearningPath.findOne({ _id: id, isDeleted: false, status: { $ne: 'archived' } })
    .select('_id programs')
    .lean();

const countDepartments = (ids) =>
  Department.countDocuments({ _id: { $in: ids }, isDeleted: { $ne: true } });

const countUsers = (ids) =>
  User.countDocuments({ _id: { $in: ids }, isDeleted: { $ne: true } });

const findAssignableUsers = ({ userIds = [], departmentIds = [] }) => {
  const or = [];
  if (userIds.length) or.push({ _id: { $in: userIds } });
  if (departmentIds.length) or.push({ departmentId: { $in: departmentIds } });
  if (!or.length) return [];
  return User.find({
    $or: or,
    isDeleted: { $ne: true },
    status: { $in: ASSIGNABLE_USER_STATUSES },
  })
    .select('empCode name email department departmentId status')
    .sort({ name: 1 })
    .lean();
};

const findProgramCohortIds = (programId) =>
  Class.find({ programId, isDeleted: { $ne: true } }).distinct('_id');

const findParticipatingUserIdsForProgram = async (userIds, programId) => {
  const classIds = await findProgramCohortIds(programId);
  if (!classIds.length) return new Set();
  const rows = await Enrollment.find({
    userId: { $in: userIds },
    classId: { $in: classIds },
    status: { $in: PARTICIPATING_STATUSES },
  }).distinct('userId');
  return new Set(rows.map((id) => id.toString()));
};

// ── Learner self view (Cohesion P3) ───────────────────────
// Active assignments targeting one user directly or via their department.
const findActiveAssignmentsForUser = (userId, departmentId) => {
  const or = [{ userIds: userId }];
  if (departmentId) or.push({ departmentIds: departmentId });
  return populateAssignment(
    Assignment.find({ isDeleted: false, status: 'active', $or: or }).sort({ dueDate: 1 }),
  ).lean();
};

// Enroll-CTA resolution: an Ongoing cohort of the program, but ONLY when the
// program is learner-enrollable (`self_enroll`) — other scheduling modes have
// no self-service path. Capacity + prerequisites stay enforced at enroll time.
const findOpenSelfEnrollCohort = async (programId) => {
  if (!programId) return null;
  const program = await LearningProgram.findById(programId).select('schedulingMode').lean();
  if (!program || program.schedulingMode !== 'self_enroll') return null;
  return Class.findOne({ programId, status: 'Ongoing', isDeleted: { $ne: true } })
    .select('classCode')
    .lean();
};

module.exports = {
  PARTICIPATING_STATUSES,
  ASSIGNABLE_USER_STATUSES,
  create,
  findById,
  list,
  archive,
  findProgram,
  findPath,
  countDepartments,
  countUsers,
  findAssignableUsers,
  findActiveAssignmentsForUser,
  findOpenSelfEnrollCohort,
  findParticipatingUserIdsForProgram,
};
