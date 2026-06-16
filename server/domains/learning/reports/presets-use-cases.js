const { ServiceError } = require('../../../helpers/ServiceError');
const repository = require('./presets-repository');

// Saved report presets — CRUD business rules (A5 part 2, Horizon 1).

const listPresets = () => repository.list();

const createPreset = (body, actorId) => repository.create({ ...body, createdBy: actorId || null });

const updatePreset = async (id, body) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Report preset not found', 404);
  const after = await repository.updateById(id, body);
  return { before, after };
};

const archivePreset = async (id) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Report preset not found', 404);
  const after = await repository.softDeleteById(id);
  return { before, after };
};

module.exports = { listPresets, createPreset, updatePreset, archivePreset };
