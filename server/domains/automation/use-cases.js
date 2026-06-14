const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./repository');
const { TRIGGERS, ACTION_TYPES } = require('./schemas');

// Automation rule CRUD (TMS.update gap #3). The runner reads rules live, so no
// cache to refresh — a saved rule is in effect on the next event.

const listRules = async () => {
  const rules = await repository.listLive();
  return { rules, triggers: TRIGGERS, actionTypes: ACTION_TYPES };
};

const createRule = async (data) => {
  const created = await repository.create({ ...data, system: false });
  return created.toObject ? created.toObject() : created;
};

const updateRule = async (id, patch) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Automation rule not found', 404);
  const after = await repository.updateById(id, patch);
  return { before, after };
};

const deleteRule = async (id) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Automation rule not found', 404);
  if (before.system) throw new ServiceError('System rules cannot be deleted — disable it instead', 400);
  const after = await repository.softDeleteById(id);
  return { before, after };
};

module.exports = { listRules, createRule, updateRule, deleteRule };
