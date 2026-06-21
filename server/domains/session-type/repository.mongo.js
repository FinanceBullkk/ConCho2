const SessionType = require('../../models/SessionType');

// ──────────────────────────────────────────────────────────
// session-type/repository — MONGO impl. All Mongoose access for SessionTypes
// (Build Plan #5). Soft-deleted rows are auto-excluded by the model hook.
// (Was repository.js; split into mongo/pg behind a DB_BACKEND selector in the
// Phase-3 Wave-B port — behaviour-preserving.)
// ──────────────────────────────────────────────────────────

const create = (data) => SessionType.create(data);

const list = () => SessionType.find({}).sort({ order: 1, createdAt: 1 }).lean();

const findByIdLean = (id) => SessionType.findOne({ _id: id, isDeleted: false }).lean();

const updateById = (id, data) =>
  SessionType.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const softDelete = (id) =>
  SessionType.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  ).lean();

// Highest order in use (for appending a new type to the end).
const maxOrder = async () => {
  const top = await SessionType.findOne({}).sort({ order: -1 }).select('order').lean();
  return top ? (top.order || 0) : 0;
};

module.exports = { create, list, findByIdLean, updateById, softDelete, maxOrder };
