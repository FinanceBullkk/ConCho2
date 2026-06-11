const Department = require('../../models/Department');
const User = require('../../models/User');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');

// ──────────────────────────────────────────────────────────
// org/repository — all Mongoose access for the org domain
// (departments + manager hierarchy + the manager-dashboard rollups).
// ──────────────────────────────────────────────────────────

// Enrollment statuses that count as "currently participating" (mirrors
// enrollment/prerequisites.js so the rollup matches the completion engine).
const PARTICIPATING_STATUSES = ['Active', 'On-hold', 'Completed'];

// ── Departments ───────────────────────────────────────────
const createDepartment = (data) => Department.create(data);

const findDepartmentById = (id) => Department.findOne({ _id: id, isDeleted: false });

const findDepartmentByIdLean = (id) => Department.findOne({ _id: id, isDeleted: false }).lean();

const listDepartments = ({ search } = {}) => {
  const filter = { isDeleted: false };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  return Department.find(filter).sort({ name: 1 }).lean();
};

const updateDepartmentById = (id, data) =>
  Department.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const softDeleteDepartment = (id) =>
  updateDepartmentById(id, { isDeleted: true, deletedAt: new Date() });

// How many live users still point at this department (block/flag on archive).
const countUsersInDepartment = (departmentId) =>
  User.countDocuments({ departmentId, isDeleted: { $ne: true } });

// ── Manager hierarchy / assignment ────────────────────────
const findUserById = (id) => User.findOne({ _id: id, isDeleted: { $ne: true } });

const findUserByIdLean = (id) => User.findOne({ _id: id, isDeleted: { $ne: true } }).lean();

const updateUserAssignment = (id, patch) =>
  User.findOneAndUpdate(
    { _id: id, isDeleted: { $ne: true } },
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();

// Direct reports of a manager (the dashboard scope), with department populated.
const listDirectReports = (managerId) =>
  User.find({ managerId, isDeleted: { $ne: true } })
    .select('name empCode email role status department departmentId position')
    .populate('departmentId', 'name code')
    .sort({ name: 1 })
    .lean();

// ── Training rollups (batched — no N+1 over the report set) ─
// One aggregate over Enrollment + one over Certificate, grouped by user.

// Active (participating) enrollment count per user, over the given user ids.
const aggregateActiveEnrollments = (userIds) =>
  Enrollment.aggregate([
    { $match: { userId: { $in: userIds }, status: { $in: PARTICIPATING_STATUSES } } },
    { $group: { _id: '$userId', count: { $sum: 1 }, programs: { $addToSet: '$classId' } } },
  ]);

// Issued certificates per user (durable completion proof), with distinct
// programs so we can report "programs completed".
const aggregateIssuedCertificates = (userIds) =>
  Certificate.aggregate([
    { $match: { userId: { $in: userIds }, status: 'Issued', isDeleted: false } },
    { $group: { _id: '$userId', count: { $sum: 1 }, programs: { $addToSet: '$programId' } } },
  ]);

module.exports = {
  PARTICIPATING_STATUSES,
  createDepartment,
  findDepartmentById,
  findDepartmentByIdLean,
  listDepartments,
  updateDepartmentById,
  softDeleteDepartment,
  countUsersInDepartment,
  findUserById,
  findUserByIdLean,
  updateUserAssignment,
  listDirectReports,
  aggregateActiveEnrollments,
  aggregateIssuedCertificates,
};
