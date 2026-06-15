const TenantConfig = require('../../models/TenantConfig');

// All Mongoose access for the branding domain (TMS.update gap #5). The config is
// a singleton (key='default').

const getSingleton = () => TenantConfig.getSingleton();

const update = (patch) =>
  TenantConfig.findOneAndUpdate(
    { key: 'default' },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

module.exports = { getSingleton, update };
