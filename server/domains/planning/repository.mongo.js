const TrainingRequest = require('../../models/TrainingRequest');
const TrainingPlan = require('../../models/TrainingPlan');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');
const Skill = require('../../models/Skill');

// ──────────────────────────────────────────────────────────
// planning/repository — MONGO impl for A4 (TNA → annual plan, H2).
// Same interface as ./repository.pg. The scheduleItem transaction methods
// accept the Unit-of-Work `tx` ({ session }) OR a raw Mongoose session
// (legacy shape) via the sessionOf shim — same convention as the schedule repo.
// ──────────────────────────────────────────────────────────

// Accepts a UoW tx ({ session }), a raw mongoose ClientSession, or nothing.
// NB: never discriminate on `.client` — a ClientSession exposes a `.client` getter.
const sessionOf = (tx) => {
  if (!tx) return undefined;
  if (tx.session) return tx.session;                        // { session } UoW wrapper
  if (typeof tx.startTransaction === 'function') return tx; // raw mongoose ClientSession
  return undefined;                                         // { client } (pg, unused here) / {} / undefined
};

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
// Optional `tx` enlists it in the scheduleItem transaction.
const markRequestsPlanned = (kind, id, quarter, tx) => {
  const session = sessionOf(tx);
  return TrainingRequest.updateMany(
    { 'target.kind': kind, 'target.id': id, targetQuarter: quarter, status: 'approved' },
    { $set: { status: 'planned' } },
    session ? { session } : {},
  );
};

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

// Link a scheduled cohort onto its plan item (positional $push). Replaces the
// old hydrated-doc `items.id(itemId).cohortIds.push()` + `.save()` flow so the
// write has a Postgres analogue. `tx` enlists it in the scheduleItem
// transaction. Returns matchedCount (0 = plan or item gone).
// TrainingPlan has NO updateOne soft-delete hook → filter isDeleted explicitly.
const pushCohortIdToPlanItem = async (fiscalYear, itemId, cohortId, tx) => {
  const session = sessionOf(tx);
  const res = await TrainingPlan.updateOne(
    { fiscalYear, 'items._id': itemId, isDeleted: { $ne: true } },
    { $push: { 'items.$.cohortIds': cohortId } },
    session ? { session } : {},
  );
  return res.matchedCount;
};

// ── Cohort creation (schedule a plan item) ───────────────────────────────────
const findProgramById = (id) => LearningProgram.findById(id).select('name code status').lean();

// Optional `tx` enlists the insert in the scheduleItem transaction.
const createCohortClass = (data, tx) => {
  const session = sessionOf(tx);
  return session ? Class.create([data], { session }).then((arr) => arr[0]) : Class.create(data);
};

// ── Label lookups (demand display) ───────────────────────────────────────────
// NB: Department HAS a soft-delete find-hook (deleted depts hidden); Skill has
// an isDeleted field but NO hook (deleted skills still labelled); LearningProgram
// has no soft-delete at all. The PG twin mirrors this asymmetry.
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
  upsertPlan,
  pushCohortIdToPlanItem,
  findProgramById,
  createCohortClass,
  findProgramsByIds,
  findSkillsByIds,
  findDepartmentsByIds,
};
