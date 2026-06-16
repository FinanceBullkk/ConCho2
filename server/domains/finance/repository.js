const CostEntry = require('../../models/CostEntry');
const Budget = require('../../models/Budget');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');
const Class = require('../../models/Class');
const Vendor = require('../../models/Vendor');
const Setting = require('../../models/Setting');

// ──────────────────────────────────────────────────────────
// finance/repository — all Mongoose access for A1 (budget & cost, Horizon 1).
// ──────────────────────────────────────────────────────────

// Tenant currency comes from the executive ROI cost-config (the single place an
// org records its money currency today). Falls back to env, then USD. The key
// mirrors executive-repository.COST_CONFIG_KEY (kept local to avoid a
// cross-domain require for one constant).
const COST_CONFIG_KEY = 'LND_COST_CONFIG';
const getTenantCurrency = async () => {
  const row = await Setting.findOne({ key: COST_CONFIG_KEY }).lean();
  const configured = row?.value?.currency;
  return (configured || process.env.DEFAULT_CURRENCY || 'USD').toUpperCase();
};

// ── CostEntry CRUD ───────────────────────────────────────────────────────────
const createCostEntry = (data) => CostEntry.create(data);

const listCostEntries = (filter = {}) =>
  CostEntry.find(filter).sort({ incurredOn: -1, createdAt: -1 }).limit(500).lean();

const findCostEntryById = (id) => CostEntry.findOne({ _id: id }).lean();

const updateCostEntry = (id, data) =>
  CostEntry.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true }).lean();

const softDeleteCostEntry = (id) =>
  CostEntry.findOneAndUpdate(
    { _id: id },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

// ── Budget CRUD ──────────────────────────────────────────────────────────────
const createBudget = (data) => Budget.create(data);

const listBudgets = (filter = {}) =>
  Budget.find(filter).sort({ fiscalYear: -1, createdAt: -1 }).limit(500).lean();

const findBudgetById = (id) => Budget.findOne({ _id: id }).lean();

const updateBudget = (id, data) =>
  Budget.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true }).lean();

const softDeleteBudget = (id) =>
  Budget.findOneAndUpdate(
    { _id: id },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

// ── Aggregations ─────────────────────────────────────────────────────────────
// Total minor spend in a date window (executive ROI trailing-12-month actual).
const sumCostEntries = async ({ from, to } = {}) => {
  const match = {};
  if (from || to) {
    match.incurredOn = {};
    if (from) match.incurredOn.$gte = from;
    if (to) match.incurredOn.$lte = to;
  }
  const [row] = await CostEntry.aggregate([
    { $match: match },
    { $group: { _id: null, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
  ]);
  return { totalMinor: row?.totalMinor || 0, count: row?.count || 0 };
};

// Group spend by one scope dimension (or `type`) within an optional window.
const rollupCostEntries = async ({ groupField, from, to } = {}) => {
  const match = {};
  if (from || to) {
    match.incurredOn = {};
    if (from) match.incurredOn.$gte = from;
    if (to) match.incurredOn.$lte = to;
  }
  return CostEntry.aggregate([
    { $match: match },
    { $group: { _id: `$${groupField}`, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    { $sort: { totalMinor: -1 } },
  ]);
};

// Lean cost rows (scope + amount) in a window — variance matches these in JS.
const listCostScopesInRange = ({ from, to } = {}) => {
  const filter = {};
  if (from || to) {
    filter.incurredOn = {};
    if (from) filter.incurredOn.$gte = from;
    if (to) filter.incurredOn.$lte = to;
  }
  return CostEntry.find(filter).select('scope amountMinor').lean();
};

// ── Label lookups (roll-up / variance display) ───────────────────────────────
const findProgramsByIds = (ids) =>
  ids.length ? LearningProgram.find({ _id: { $in: ids } }).select('name code').lean() : [];

const findDepartmentsByIds = (ids) =>
  ids.length ? Department.find({ _id: { $in: ids } }).select('name').lean() : [];

const findClassesByIds = (ids) =>
  ids.length ? Class.find({ _id: { $in: ids } }).select('classCode courseName').lean() : [];

// A2: resolve real vendor names for the `by=vendor` cost roll-up label (was a
// `Vendor xxxxxx` id-slice placeholder before the Vendor model existed).
const findVendorsByIds = (ids) =>
  ids.length ? Vendor.find({ _id: { $in: ids } }).select('name').lean() : [];

module.exports = {
  getTenantCurrency,
  createCostEntry,
  listCostEntries,
  findCostEntryById,
  updateCostEntry,
  softDeleteCostEntry,
  createBudget,
  listBudgets,
  findBudgetById,
  updateBudget,
  softDeleteBudget,
  sumCostEntries,
  rollupCostEntries,
  listCostScopesInRange,
  findProgramsByIds,
  findDepartmentsByIds,
  findClassesByIds,
  findVendorsByIds,
};
