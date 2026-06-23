const ReportPreset = require('../../../models/ReportPreset');

// All Mongoose access for saved report presets (A5 part 2, Horizon 1).

const create = (data) => ReportPreset.create(data);
const list = () => ReportPreset.find({}).sort({ updatedAt: -1 }).limit(200).lean();
const findById = (id) => ReportPreset.findOne({ _id: id }).lean();
const updateById = (id, patch) =>
  ReportPreset.findOneAndUpdate({ _id: id }, { $set: patch }, { new: true, runValidators: true }).lean();
const softDeleteById = (id) =>
  ReportPreset.findOneAndUpdate(
    { _id: id },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

module.exports = { create, list, findById, updateById, softDeleteById };
