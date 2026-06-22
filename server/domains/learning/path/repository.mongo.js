const LearningPath = require('../../../models/LearningPath');

// learning/path/repository — MONGO impl. (Was repository.js; split into mongo/pg
// behind a DB_BACKEND selector in the Phase-3 Wave-B port — behaviour-preserving.)

// Populate programs with just the catalog summary fields the DTO needs.
const PROGRAM_FIELDS = 'code name category status schedulingMode';

const create = async (data) => {
  const created = await LearningPath.create(data);
  return findByIdLean(created._id);
};

// Mongoose doc (not lean) — for the audit `before` snapshot + existence checks.
const findById = (id) => LearningPath.findOne({ _id: id, isDeleted: false });

const findByIdLean = (id) =>
  LearningPath.findOne({ _id: id, isDeleted: false })
    .populate('programs', PROGRAM_FIELDS)
    .lean();

const list = ({ status, search }) => {
  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ code: rx }, { title: rx }];
  }
  return LearningPath.find(filter)
    .populate('programs', PROGRAM_FIELDS)
    .sort({ title: 1 })
    .lean();
};

const updateById = (id, data) =>
  LearningPath.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  )
    .populate('programs', PROGRAM_FIELDS)
    .lean();

const softDelete = (id) =>
  updateById(id, { isDeleted: true, deletedAt: new Date(), status: 'archived' });

module.exports = { create, findById, findByIdLean, list, updateById, softDelete };
