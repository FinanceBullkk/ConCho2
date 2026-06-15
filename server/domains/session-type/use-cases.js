const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// session-type/use-cases — business rules (Build Plan #5).
// Pure CRUD + soft-delete. Types are metadata only; nothing here touches
// booking, slot, or room logic.
// ──────────────────────────────────────────────────────────

const listSessionTypes = () => repository.list();

const createSessionType = async (body) => {
  // Append to the end of the display order unless the caller pins one.
  const order = body.order ?? (await repository.maxOrder()) + 1;
  return repository.create({ ...body, order });
};

const updateSessionType = async (id, body) => {
  const before = await repository.findByIdLean(id);
  if (!before) throw new ServiceError('Session type not found', 404);
  const after = await repository.updateById(id, body);
  return { before, after };
};

// Soft-delete — keeps the type on any historical sessions that referenced it.
const archiveSessionType = async (id) => {
  const before = await repository.findByIdLean(id);
  if (!before) throw new ServiceError('Session type not found', 404);
  const after = await repository.softDelete(id);
  return { before, after };
};

module.exports = { listSessionTypes, createSessionType, updateSessionType, archiveSessionType };
