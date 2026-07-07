const AutomationRule = require('../../models/AutomationRule');

// All Mongoose access for the automation domain (TMS.update gap #3).
const listLive = () => AutomationRule.find({ isDeleted: false }).sort({ system: -1, name: 1 }).lean();
const findById = (id) => AutomationRule.findOne({ _id: id, isDeleted: false }).lean();
// The runner's hot path: enabled rules for a fired trigger.
const findEnabledByTrigger = (trigger) =>
  AutomationRule.find({ isDeleted: false, enabled: true, trigger }).lean();
const create = (data) => AutomationRule.create(data);
const updateById = (id, patch) =>
  AutomationRule.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: patch }, { new: true }).lean();
const softDeleteById = (id) =>
  AutomationRule.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } }, { new: true }).lean();
const recordRun = (id) =>
  AutomationRule.updateOne({ _id: id }, { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } });

// Boot-time system-rule seed (Phase 5 slice 3 — A8): insert-if-missing keyed by
// (name, system) with NO isDeleted predicate — a soft-deleted (admin-hidden)
// system rule matches and is NOT resurrected on the next boot.
const upsertSystemRuleByName = (rule) =>
  AutomationRule.updateOne(
    { name: rule.name, system: true },
    { $setOnInsert: rule },
    { upsert: true },
  );

module.exports = { listLive, findById, findEnabledByTrigger, create, updateById, softDeleteById, recordRun, upsertSystemRuleByName };
