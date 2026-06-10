const repository = require('./office-repository');
const { ServiceError } = require('../../helpers/ServiceError');
const { officeDto } = require('./dto');

// ──────────────────────────────────────────────────────────
// org/office-use-cases — business rules for Offices
// (re-center Phase 1): CRUD + the referenced-archive guard.
// ──────────────────────────────────────────────────────────

const asConflict = (error) => {
  if (error && error.code === 11000) {
    return new ServiceError('An office with this code already exists', 409);
  }
  return error;
};

const listOffices = async (query) => {
  const rows = await repository.listOffices(query);
  return rows.map(officeDto);
};

const createOffice = async (payload) => {
  try {
    const created = await repository.createOffice(payload);
    return officeDto(created);
  } catch (error) {
    throw asConflict(error);
  }
};

const updateOffice = async (id, payload) => {
  const before = await repository.findOfficeByIdLean(id);
  if (!before) throw new ServiceError('Office not found', 404);
  try {
    const updated = await repository.updateOfficeById(id, payload);
    return { before: officeDto(before), after: officeDto(updated) };
  } catch (error) {
    throw asConflict(error);
  }
};

// Soft-delete; refuse while users still point at the office (avoid orphaning
// officeId references — reassign first). Phase 3 extends this guard to Rooms.
const archiveOffice = async (id) => {
  const before = await repository.findOfficeByIdLean(id);
  if (!before) throw new ServiceError('Office not found', 404);
  const inUse = await repository.countUsersInOffice(id);
  if (inUse > 0) {
    throw new ServiceError(`Cannot archive: ${inUse} user(s) still assigned to this office`, 409);
  }
  const deleted = await repository.softDeleteOffice(id);
  return { before: officeDto(before), after: officeDto(deleted) };
};

module.exports = {
  listOffices,
  createOffice,
  updateOffice,
  archiveOffice,
};
