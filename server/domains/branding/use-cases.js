const repository = require('./repository');
const { setBrandingCache } = require('../../lib/branding');

// Branding designer business rules (TMS.update gap #5). On save we refresh the
// in-memory branding cache so the email + certificate pipelines pick up the new
// values immediately (no reboot).

const getConfig = () => repository.getSingleton();

const updateConfig = async (patch) => {
  const before = await repository.getSingleton();
  const after = await repository.update(patch);
  setBrandingCache(after); // keep the sync pipeline cache fresh
  return { before, after };
};

module.exports = { getConfig, updateConfig };
