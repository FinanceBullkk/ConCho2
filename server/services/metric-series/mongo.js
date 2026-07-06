// Metric time-series — MONGO impl (Phase 3 metrics Wave-A port).
// Reuses the REAL Phase-0 metrics-repository (findSnapshotSeries) — the same read
// analyticsSeriesService.getSeries runs — so the parity test proves the PG SQL
// matches live behaviour, not a re-implementation. Normalises `date` to an ISO
// string so the interface is backend-agnostic (the PG impl returns the identical
// shape and the parity test is a plain deep-equal).
//
// Semantic interface: getMetricSeries({ key, scope, scopeId, since })
//   → [{ date: ISO, value }] ascending by date. `since` is a concrete Date — the
//   range→since derivation stays in analyticsSeriesService (pure date logic).
// Pin impls.mongo explicitly — metrics-repository became a DB_BACKEND selector
// in Wave F-PR-1; this wrapper must stay Mongo on the pg lane.
const repo = require('../metrics-repository').impls.mongo;

const iso = (d) => new Date(d).toISOString();

const getMetricSeries = async ({ key, scope = 'global', scopeId = null, since }) => {
  const rows = await repo.findSnapshotSeries({ key, scope, scopeId, since });
  return rows.map((r) => ({ date: iso(r.date), value: r.value }));
};

module.exports = { getMetricSeries };
