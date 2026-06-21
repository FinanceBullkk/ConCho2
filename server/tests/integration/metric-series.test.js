/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — metric-series dual-backend repository (Phase 3)
 * ──────────────────────────────────────────────────────────
 * Metric time-series read ported to dual-backend behind one interface — the
 * sibling of the metrics-funnel reference (both read the metrics surface).
 * Pins the Mongo path (reuses the real metrics-repository findSnapshotSeries via
 * the same query analyticsSeriesService.getSeries runs) + that the PG impl loads
 * without a connection. Exact Mongo↔PG parity is proven on real Postgres by
 * tests/pg-parity/metric-series.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const metricSeries = require('../../services/metric-series');
const MetricSnapshot = require('../../models/MetricSnapshot');

const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0)); // midnight UTC
const PROGRAM = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await getApp();
  await MetricSnapshot.create([
    { scope: 'global', scopeId: null, key: 'completions', date: day(1), value: 1 },
    { scope: 'global', scopeId: null, key: 'completions', date: day(2), value: 2 },
    { scope: 'global', scopeId: null, key: 'completions', date: day(3), value: 3 },
    { scope: 'global', scopeId: null, key: 'completions', date: day(0), value: 99 }, // < since → excluded
    { scope: 'global', scopeId: null, key: 'enrollments', date: day(2), value: 50 }, // other key → excluded
    { scope: 'program', scopeId: PROGRAM, key: 'completions', date: day(2), value: 7 }, // other scope → excluded from global
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('metric-series dual-backend repository', () => {
  test('factory + both impls load (PG impl loads without opening a connection)', () => {
    expect(typeof metricSeries.getMetricSeries).toBe('function');
    expect(typeof metricSeries.impls.mongo.getMetricSeries).toBe('function');
    expect(typeof metricSeries.impls.pg.getMetricSeries).toBe('function');
  });

  test('mongo impl returns the scoped series, ordered, since-filtered (exact)', async () => {
    const series = await metricSeries.impls.mongo.getMetricSeries({
      key: 'completions', scope: 'global', scopeId: null, since: day(1),
    });
    expect(series).toEqual([
      { date: day(1).toISOString(), value: 1 },
      { date: day(2).toISOString(), value: 2 },
      { date: day(3).toISOString(), value: 3 },
    ]); // day(0) excluded (before since); 'enrollments' + program scope excluded
  });

  test('mongo impl scopes by scopeId (program series excludes global rows)', async () => {
    const series = await metricSeries.impls.mongo.getMetricSeries({
      key: 'completions', scope: 'program', scopeId: PROGRAM, since: day(1),
    });
    expect(series).toEqual([{ date: day(2).toISOString(), value: 7 }]);
  });
});
