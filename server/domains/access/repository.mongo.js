const Role = require('../../models/Role');

// access/repository — MONGO impl. Live = not soft-deleted; system roles sort
// first, then by key. (Was repository.js; split into mongo/pg behind a DB_BACKEND
// selector in the Phase-3 Wave-B port — behaviour-preserving.)
const listLive = () => Role.find({ isDeleted: false }).sort({ system: -1, key: 1 }).lean();
const findByKey = (key) => Role.findOne({ key, isDeleted: false }).lean();
const create = (data) => Role.create(data);
const updateByKey = (key, patch) =>
  Role.findOneAndUpdate({ key, isDeleted: false }, { $set: patch }, { new: true }).lean();
const softDeleteByKey = (key) =>
  Role.findOneAndUpdate({ key, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } }, { new: true }).lean();

// Idempotent boot seed (phase-05 A1): create a system role ONLY if missing —
// $setOnInsert so an admin's later capability edits are NEVER clobbered on
// reboot. (Moved verbatim from domains/access/grants-loader.js.)
const seedRoleIfMissing = ({ key, name, capabilities }) =>
  Role.updateOne(
    { key },
    { $setOnInsert: { key, name, system: true, capabilities, isDeleted: false } },
    { upsert: true },
  );

module.exports = { listLive, findByKey, create, updateByKey, softDeleteByKey, seedRoleIfMissing };
