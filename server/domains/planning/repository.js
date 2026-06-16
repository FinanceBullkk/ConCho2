const TrainingRequest = require('../../models/TrainingRequest');
const TrainingPlan = require('../../models/TrainingPlan');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');
const Skill = require('../../models/Skill');

// ──────────────────────────────────────────────────────────
// planning/repository — Mongoose access for A4 (TNA → annual plan, H2).
// ──────────────────────────────────────────────────────────

// ── TrainingRequest ──────────────────────────────────────────────────────────
const createRequest = (data) => TrainingRequest.create(data);

const listRequests = (filter = {}) =>
  TrainingRequest.find(filter).sort({ createdAt: -1 }).limit(500).lean();

const findRequestById = (id) => TrainingRequest.findOne({ _id: id }).lean();

const updateRequest = (id, data) =>
  TrainingRequest.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true }).lean();

const softDeleteRequest = (id) =>
  TrainingRequest.findOneAndUpdate(
    { _id: id }, { $set: { isDeleted: true, deletedAt: new Date() } }, { new: true },
  ).lean();

// Mark approved requests for a target+quarter as 'planned' (called on schedule).
const markRequestsPlanned = (kind, id, quarter) =>
  TrainingRequest.updateMany(
    { 'target.kind': kind, 'target.id': id, targetQuarter: quarter, status: 'approved' },
    { $set: { status: 'planned' } },
  );

// ── Demand aggregation ───────────────────────────────────────────────────────
const aggregateDemand = ({ by, fiscalYear } = {}) => {
  const match = { status: { $ne: 'rejected' } };
  if (fiscalYear) match.targetQuarter = { $regex: `^${fiscalYear}-Q` };
  let groupId;
  if (by === 'program' || by === 'skill') {
    match['target.kind'] = by;
    groupId = '$target.id';
  } else if (by === 'quarter') {
    groupId = '$targetQuarter';
  } else {
    groupId = '$departmentId';
  }
  return TrainingRequest.aggregate([
    { $match: match },
    { $group: { _id: groupId, demand: { $sum: '$headcount' }, count: { $sum: 1 } } },
    { $sort: { demand: -1 } },
  ]);
};

// ── TrainingPlan ─────────────────────────────────────────────────────────────
const findPlan = (fiscalYear) => TrainingPlan.findOne({ fiscalYear }).lean();

const upsertPlan = (fiscalYear, data) =>
  TrainingPlan.findOneAndUpdate(
    { fiscalYear },
    { $set: data, $setOnInsert: { fiscalYear } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

const findPlanDoc = (fiscalYear) => TrainingPlan.findOne({ fiscalYear }); // hydrated (item edits)

// ── Cohort creation (schedule a plan item) ───────────────────────────────────
const findProgramById = (id) => LearningProgram.findById(id).select('name code status').lean();

const createCohortClass = (data) => Class.create(data);

// ── Label lookups (demand display) ───────────────────────────────────────────
const findProgramsByIds = (ids) =>
  ids.length ? LearningProgram.find({ _id: { $in: ids } }).select('name code').lean() : [];
const findSkillsByIds = (ids) =>
  ids.length ? Skill.find({ _id: { $in: ids } }).select('name').lean() : [];
const findDepartmentsByIds = (ids) =>
  ids.length ? Department.find({ _id: { $in: ids } }).select('name').lean() : [];

module.exports = {
  createRequest,
  listRequests,
  findRequestById,
  updateRequest,
  softDeleteRequest,
  markRequestsPlanned,
  aggregateDemand,
  findPlan,
  findPlanDoc,
  upsertPlan,
  findProgramById,
  createCohortClass,
  findProgramsByIds,
  findSkillsByIds,
  findDepartmentsByIds,
};
