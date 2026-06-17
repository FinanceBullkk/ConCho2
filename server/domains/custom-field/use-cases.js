const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');
const { customFieldDto } = require('./dto');

// custom-field/use-cases — business rules for admin-defined custom fields.

// A choice field (`select`/`multiselect`) is meaningless without options.
const CHOICE_TYPES = new Set(['select', 'multiselect']);
const assertSelectHasOptions = (type, options) => {
  if (CHOICE_TYPES.has(type) && (!Array.isArray(options) || options.length === 0)) {
    throw new ServiceError('A select or multiselect field needs at least one option', 400);
  }
};

const asConflict = (error) => {
  if (error && error.code === 11000) {
    return new ServiceError('A field with this key already exists for this entity', 409);
  }
  return error;
};

const listDefinitions = async (query) => (await repository.list(query)).map(customFieldDto);

const createDefinition = async (payload) => {
  assertSelectHasOptions(payload.type, payload.options);
  try {
    return customFieldDto(await repository.create(payload));
  } catch (error) {
    throw asConflict(error);
  }
};

const updateDefinition = async (id, payload) => {
  const before = await repository.findByIdLean(id);
  if (!before) throw new ServiceError('Custom field not found', 404);
  // Validate the EFFECTIVE shape after the patch (type/options may be partial).
  assertSelectHasOptions(payload.type ?? before.type, payload.options ?? before.options);
  try {
    const after = await repository.updateById(id, payload);
    return { before: customFieldDto(before), after: customFieldDto(after) };
  } catch (error) {
    throw asConflict(error);
  }
};

const archiveDefinition = async (id) => {
  const before = await repository.findByIdLean(id);
  if (!before) throw new ServiceError('Custom field not found', 404);
  const after = await repository.softDelete(id);
  return { before: customFieldDto(before), after: customFieldDto(after) };
};

// Drag-reorder one entity's fields. `orderedIds` must be an EXACT permutation of
// that entity's current live fields — anything else (missing/extra/stale id)
// would silently drop or gap the order, so we reject it up front (400).
const reorderDefinitions = async (entity, orderedIds) => {
  const current = await repository.list({ entity });
  const liveIds = new Set(current.map((f) => String(f._id)));
  const sameLength = orderedIds.length === liveIds.size;
  const allKnown = orderedIds.every((id) => liveIds.has(String(id)));
  const noDupes = new Set(orderedIds.map(String)).size === orderedIds.length;
  if (!sameLength || !allKnown || !noDupes) {
    throw new ServiceError('orderedIds must list each current field for this entity exactly once', 400);
  }
  await repository.reorder(entity, orderedIds);
  const after = await repository.list({ entity });
  return { before: current.map(customFieldDto), after: after.map(customFieldDto) };
};

module.exports = { listDefinitions, createDefinition, updateDefinition, archiveDefinition, reorderDefinitions };
