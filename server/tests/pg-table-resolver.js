/**
 * PG table resolver (Wave K · Phase 2 · D2e-2b).
 *
 * Extracted from the retired `pg-auto-mirror.js` (whose Mongoose→PG mirror is
 * gone now that every fixture is authored PG-natively). All that survives is the
 * table resolver: map a model NAME to its migrated Postgres table — the explicit
 * `pg-row-mappers` MAPPERS first, else a reflective snake_case/plural guess
 * against `information_schema`. Consumed by `pg-test-utils`' active-backend reads
 * (`readActiveRow`, `deleteActiveRowsWhere`, …) for the long-tail models that
 * have no explicit mapper. No `mongoose` dependency.
 */
const { query } = require('../config/pg');
const { MAPPERS } = require('./pg-row-mappers');

let PG_TABLES = null;               // Set<tableName> — loaded once per run
const TABLE_FOR_MODEL = new Map();  // modelName → tableName | null (cached)

const loadTables = async () => {
  if (PG_TABLES) return;
  const { rows } = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  PG_TABLES = new Set(rows.map((r) => r.table_name));
};

const toSnake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const resolveTable = (modelName) => {
  if (TABLE_FOR_MODEL.has(modelName)) return TABLE_FOR_MODEL.get(modelName);
  const s = toSnake(modelName);
  const candidates = [`${s}s`, `${s}es`, s, s.replace(/y$/, 'ies')];
  const hit = candidates.find((c) => PG_TABLES.has(c)) || null;
  TABLE_FOR_MODEL.set(modelName, hit);
  return hit;
};

/** Resolve a model's PG table (explicit mapper first, else reflected). Null when
 *  the model has no PG table. */
const tableFor = async (modelName) => {
  if (!modelName) return null;
  if (MAPPERS[modelName]) return MAPPERS[modelName].table;
  await loadTables();
  return resolveTable(modelName);
};

module.exports = { tableFor };
