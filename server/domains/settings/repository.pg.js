const crypto = require('crypto');
const { query } = require('../../config/pg');

// settings/repository — POSTGRES impl (settings table, mig 016). Same
// interface as ./repository.mongo; rows are plain objects shaped like the
// Mongo docs (the controller res.json's them directly).
//
// Fidelity notes the parity test pins:
//   • upsertMany is upsert-by-key (uq_settings_key) — $set value only, so an
//     existing row keeps its description; a new row gets defaults.
//   • value is jsonb — arrays/objects/scalars round-trip as-is.
//   • no soft-delete (mirrors the Setting model).

const newId = () => crypto.randomBytes(12).toString('hex');

const settingRow = (r) => (r == null ? null : {
  _id: r.id, key: r.key, value: r.value, description: r.description || '',
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const findAll = async () => {
  const { rows } = await query('SELECT * FROM settings ORDER BY key ASC');
  return rows.map(settingRow);
};

const findByKeys = async (keys) => {
  const { rows } = await query('SELECT * FROM settings WHERE key = ANY($1)', [keys.map(String)]);
  return rows.map(settingRow);
};

const findByKeysLean = findByKeys;

const upsertMany = async (items) => {
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop -- whitelisted keys: 1-2 items
    await query(
      `INSERT INTO settings(id, key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [newId(), item.key, JSON.stringify(item.value)]
    );
  }
};

module.exports = { findAll, findByKeys, findByKeysLean, upsertMany };
