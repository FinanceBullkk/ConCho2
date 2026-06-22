const TenantConfig = require('../../models/TenantConfig');

// branding/repository — MONGO impl. The config is a singleton (key='default').
// (Was repository.js; split into mongo/pg behind a DB_BACKEND selector in the
// Phase-3 Wave-B port — behaviour-preserving.)

const getSingleton = () => TenantConfig.getSingleton();

const update = (patch) =>
  TenantConfig.findOneAndUpdate(
    { key: 'default' },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

module.exports = { getSingleton, update };
