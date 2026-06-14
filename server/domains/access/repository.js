const Role = require('../../models/Role');

// All Mongoose access for the roles domain (TMS.update gap #2). Live = not
// soft-deleted; system roles sort first, then by key.
const listLive = () => Role.find({ isDeleted: false }).sort({ system: -1, key: 1 }).lean();
const findByKey = (key) => Role.findOne({ key, isDeleted: false }).lean();
const create = (data) => Role.create(data);
const updateByKey = (key, patch) =>
  Role.findOneAndUpdate({ key, isDeleted: false }, { $set: patch }, { new: true }).lean();
const softDeleteByKey = (key) =>
  Role.findOneAndUpdate({ key, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } }, { new: true }).lean();

module.exports = { listLive, findByKey, create, updateByKey, softDeleteByKey };
