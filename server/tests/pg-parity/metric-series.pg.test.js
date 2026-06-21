/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — metric time-series (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Runs only when a Postgres URL is present (CI pg-parity job sets PG_URL;
 * locally PG_PROTOTYPE_URL → Neon). SKIPS otherwise. Proves the snapshot series
 * read is identical on both backends across every query shape that matters:
 *   • scope + scopeId filtering (global scope_id IS NULL never picks up
 *     program/office rows; a program series is its scopeId only);
 *   • key filtering (one metric only);
 *   • the `since` lower-bound (older rows drop out);
 *   • ascending-by-date order;
 *   • an empty series degrades to [].
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const metricSeries = require('../../services/metric-series');
const MetricSnapshot = require('../../models/MetricSnapshot');

const hex = (n) => n.toString(16).padStart(24, '0');
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const PROG = hex(1);
const OFFICE = hex(2);

describePg('PG-parity: metric time-series (scope/key/since filtering + order)', () => {
  let mem;

  // ── shared fixture ───────────────────────────────────────
  const snaps = [];
  let sid = 5000;
  const add = (scope, scopeId, key, d, value) => snaps.push({ id: hex(sid += 1), date: day(d), scope, scopeId, key, value });
  [[1, 10], [2, 12], [3, 9], [4, 15], [5, 20]].forEach(([d, v]) => add('global', null, 'completions', d, v));
  add('global', null, 'completions', 0, 99);                 // older (Dec 31 2025) — since-filter trap
  [[1, 3], [2, 5], [3, 8]].forEach(([d, v]) => add('global', null, 'enrollments', d, v));
  [[2, 1], [3, 2], [4, 4]].forEach(([d, v]) => add('program', PROG, 'completions', d, v));
  add('office', OFFICE, 'completions', 2, 6);

  const runBoth = async (params) => [
    await metricSeries.impls.mongo.getMetricSeries(params),
    await metricSeries.impls.pg.getMetricSeries(params),
  ];

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await MetricSnapshot.insertMany(snaps.map((s) => ({
      _id: new mongoose.Types.ObjectId(s.id), date: s.date, scope: s.scope,
      scopeId: s.scopeId ? new mongoose.Types.ObjectId(s.scopeId) : null, key: s.key, value: s.value,
    })));

    await query('TRUNCATE metric_snapshots');
    await query(
      `INSERT INTO metric_snapshots(id,date,scope,scope_id,key,value) VALUES ${snaps.map((_, j) => `($${j * 6 + 1},$${j * 6 + 2},$${j * 6 + 3},$${j * 6 + 4},$${j * 6 + 5},$${j * 6 + 6})`).join(',')}`,
      snaps.flatMap((s) => [s.id, s.date.toISOString(), s.scope, s.scopeId, s.key, s.value]),
    );
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('global series: since-filter + key-filter + order identical, exact values', async () => {
    const [m, p] = await runBoth({ key: 'completions', scope: 'global', scopeId: null, since: day(2) });
    expect(p).toEqual(m);
    expect(m).toEqual([ // day(0)+day(1) excluded; enrollments + program/office scope excluded
      { date: day(2).toISOString(), value: 12 },
      { date: day(3).toISOString(), value: 9 },
      { date: day(4).toISOString(), value: 15 },
      { date: day(5).toISOString(), value: 20 },
    ]);
  });

  test('global series from day(1): older row (day 0) still excluded, identical', async () => {
    const [m, p] = await runBoth({ key: 'completions', scope: 'global', scopeId: null, since: day(1) });
    expect(p).toEqual(m);
    expect(m.map((r) => r.value)).toEqual([10, 12, 9, 15, 20]);
  });

  test('program scope: scopeId-filtered series, no global rows leak, identical', async () => {
    const [m, p] = await runBoth({ key: 'completions', scope: 'program', scopeId: PROG, since: day(1) });
    expect(p).toEqual(m);
    expect(m).toEqual([
      { date: day(2).toISOString(), value: 1 },
      { date: day(3).toISOString(), value: 2 },
      { date: day(4).toISOString(), value: 4 },
    ]);
  });

  test('other key (enrollments) + office scope read identically on both backends', async () => {
    const [me, pe] = await runBoth({ key: 'enrollments', scope: 'global', scopeId: null, since: day(1) });
    expect(pe).toEqual(me);
    expect(me.map((r) => r.value)).toEqual([3, 5, 8]);

    const [mo, po] = await runBoth({ key: 'completions', scope: 'office', scopeId: OFFICE, since: day(1) });
    expect(po).toEqual(mo);
    expect(mo).toEqual([{ date: day(2).toISOString(), value: 6 }]);
  });

  test('empty series degrades to [] on both backends', async () => {
    const [m, p] = await runBoth({ key: 'does_not_exist', scope: 'global', scopeId: null, since: day(1) });
    expect(m).toEqual([]);
    expect(p).toEqual([]);
  });
});
