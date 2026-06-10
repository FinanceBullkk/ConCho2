const Office = require('../../models/Office');
const User = require('../../models/User');

// ──────────────────────────────────────────────────────────
// org/office-repository — all Mongoose access for Offices
// (re-center Phase 1). Phase 3 adds Room lookups here when
// Rooms (Office-scoped) land.
// ──────────────────────────────────────────────────────────

const createOffice = (data) => Office.create(data);

const findOfficeByIdLean = (id) => Office.findOne({ _id: id, isDeleted: false }).lean();

const listOffices = ({ search } = {}) => {
  const filter = { isDeleted: false };
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  return Office.find(filter).sort({ name: 1 }).lean();
};

const updateOfficeById = (id, data) =>
  Office.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();

const softDeleteOffice = (id) =>
  updateOfficeById(id, { isDeleted: true, deletedAt: new Date() });

// How many live users still point at this office (blocks archive).
const countUsersInOffice = (officeId) =>
  User.countDocuments({ officeId, isDeleted: { $ne: true } });

module.exports = {
  createOffice,
  findOfficeByIdLean,
  listOffices,
  updateOfficeById,
  softDeleteOffice,
  countUsersInOffice,
};
