const Setting = require('../../models/Setting');

// settings/repository — MONGO impl. The Setting-model touches of
// settingController (B4), extracted verbatim so the Postgres twin swaps
// cleanly. Settings have NO soft-delete (mirrors the model).

const findAll = () => Setting.find();

const findByKeys = (keys) => Setting.find({ key: { $in: keys } });

const findByKeysLean = (keys) => Setting.find({ key: { $in: keys } }).lean();

// Bulk upsert-by-key — the PUT /api/settings write (whitelisted keys only,
// enforced by the controller).
const upsertMany = (items) =>
  Setting.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { key: item.key },
        update: { $set: { value: item.value } },
        upsert: true,
      },
    }))
  );

module.exports = { findAll, findByKeys, findByKeysLean, upsertMany };
