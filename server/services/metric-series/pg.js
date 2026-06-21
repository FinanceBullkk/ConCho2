// Metric time-series — POSTGRES impl (Phase 3 metrics Wave-A port).
// Same semantic interface as ./mongo. One indexed read of metric_snapshots
// (equality on scope+scope_id+key, range on date — the ix_metric_snap_read path).
// A null scopeId means global scope → `scope_id IS NULL` (mirrors the Mongo
// `scopeId || null` match), so a global series never picks up program/office rows.
const { query } = require('../../config/pg');

const iso = (d) => new Date(d).toISOString();

const getMetricSeries = async ({ key, scope = 'global', scopeId = null, since }) => {
  const sinceIso = new Date(since).toISOString();
  const scopeCond = scopeId == null ? 'scope_id IS NULL' : 'scope_id = $4';
  const args = scopeId == null ? [key, scope, sinceIso] : [key, scope, sinceIso, scopeId];

  const { rows } = await query(
    `SELECT date, value
       FROM metric_snapshots
      WHERE key = $1 AND scope = $2 AND ${scopeCond} AND date >= $3
      ORDER BY date ASC`,
    args,
  );

  return rows.map((r) => ({ date: iso(r.date), value: Number(r.value) }));
};

module.exports = { getMetricSeries };
