const { ServiceError } = require('../../helpers/ServiceError');
const { ALL_CAPABILITIES } = require('../../policy/capabilities');
const repository = require('./repository');
const { loadGrantsIntoMemory } = require('./grants-loader');

// Roles domain business rules (TMS.update gap #2). Every write refreshes the
// in-memory liveGrants so authz reflects the edit on the very next request.

const listRoles = async () => {
  const roles = await repository.listLive();
  return { roles, capabilities: [...ALL_CAPABILITIES] };
};

const createRole = async ({ key, name, capabilities }) => {
  if (await repository.findByKey(key)) {
    throw new ServiceError('A role with this key already exists', 409);
  }
  const role = await repository.create({ key, name, system: false, capabilities: capabilities || [] });
  await loadGrantsIntoMemory();
  return role.toObject ? role.toObject() : role;
};

const updateRole = async (key, patch) => {
  const before = await repository.findByKey(key);
  if (!before) throw new ServiceError('Role not found', 404);

  const next = {};
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.capabilities !== undefined) {
    // Admin is the superuser — its grants are immutable (lockout-proof). An
    // edit to Admin's capabilities is silently coerced back to the full set.
    next.capabilities = before.key === 'Admin' ? [...ALL_CAPABILITIES] : patch.capabilities;
  }
  const after = await repository.updateByKey(key, next);
  await loadGrantsIntoMemory();
  return { before, after };
};

const deleteRole = async (key) => {
  const before = await repository.findByKey(key);
  if (!before) throw new ServiceError('Role not found', 404);
  if (before.system) throw new ServiceError('System roles cannot be deleted', 400);
  const after = await repository.softDeleteByKey(key);
  await loadGrantsIntoMemory();
  return { before, after };
};

module.exports = { listRoles, createRole, updateRole, deleteRole };
