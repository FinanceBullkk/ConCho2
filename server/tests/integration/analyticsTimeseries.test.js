/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — analytics time-series (Investment Build Plan #1)
 * ──────────────────────────────────────────────────────────
 * The nightly snapshot writes durable per-day metrics (global + per-program);
 * the series/funnel/program endpoints read them back; empty history degrades to
 * `collecting:true` (never a fake line); reads are analytics.read-gated.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData } = require('../setup');
// Snapshots are written through the ported metrics repo (PG-only on the lane),
// so Mongoose MetricSnapshot reads see nothing — route them to the active backend.
const { findActiveRowsWhere, findActiveRowWhere, countActiveRowsWhere } = require('../pg-test-utils');
const {
  takeDailySnapshot,
  backfillHistory,
} = require('../../services/metricSnapshotService');
const series = require('../../services/analyticsSeriesService');

const LearningProgram = require('../../models/LearningProgram');
const Class = require('../../models/Class');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');

let app, tokens, seed, programId, cohortId;

const uniq = () => Math.random().toString(16).slice(2, 8);

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();

  // A program + cohort with a deterministic funnel: 3 enrolled, 1 completed,
  // 1 certified — all scoped to this program so assertions don't depend on seed.
  const program = await LearningProgram.create({
    code: `AN-${uniq()}`, name: 'Analytics Test Program', category: 'compliance',
  });
  programId = program._id;
  const cohort = await Class.create({
    classCode: `ANC-${uniq()}`, courseName: 'Analytics Test Cohort',
    totalSessions: 4, programId, status: 'Ongoing',
  });
  cohortId = cohort._id;

  await Enrollment.create([
    { userId: seed.member1._id, classId: cohortId, status: 'Active' },
    { userId: seed.member2._id, classId: cohortId, status: 'Active' },
    { userId: seed.leader._id, classId: cohortId, status: 'Completed', leftAt: new Date() },
  ]);
  await Certificate.create({
    certificateNumber: `CERT-AN-${uniq()}`, verificationCode: `ver-an-${uniq()}`,
    userId: seed.leader._id, cohortId, programId, status: 'Issued', issuedAt: new Date(),
  });

  await takeDailySnapshot();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('metric snapshot rollup', () => {
  test('writes per-program rows matching the live counts', async () => {
    const rows = await findActiveRowsWhere('MetricSnapshot', { scope: 'program', scopeId: programId });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey.active_enrollments).toBe(2);
    expect(byKey.completions).toBe(1);
    expect(byKey.enrollments).toBe(3);
    expect(byKey.certs_issued).toBe(1);
  });

  test('writes global rows too', async () => {
    const active = await findActiveRowWhere('MetricSnapshot', { scope: 'global', scopeId: null, key: 'active_enrollments' });
    expect(active).not.toBeNull();
    expect(active.value).toBeGreaterThanOrEqual(2);
  });

  test('re-running the same day is idempotent (upsert, no duplicate)', async () => {
    await takeDailySnapshot();
    const count = await countActiveRowsWhere('MetricSnapshot', { scope: 'program', scopeId: programId, key: 'active_enrollments' });
    expect(count).toBe(1);
  });
});

describe('analyticsSeriesService', () => {
  test('getSeries returns the stored program trend ascending', async () => {
    const data = await series.getSeries({ key: 'active_enrollments', scope: 'program', scopeId: programId, range: '30d' });
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[data.length - 1].value).toBe(2);
  });

  test('getFunnel reflects real stage counts + conversion', async () => {
    const f = await series.getFunnel({ programId });
    expect(f.stages.find((s) => s.key === 'enrolled').value).toBe(3);
    expect(f.stages.find((s) => s.key === 'completed').value).toBe(1);
    expect(f.stages.find((s) => s.key === 'certified').value).toBe(1);
    expect(f.conversion.enrolledToCompleted).toBe(33);
    expect(f.conversion.overall).toBe(33);
  });

  test('getProgramAnalytics combines series + funnel', async () => {
    const a = await series.getProgramAnalytics(programId, '30d');
    expect(a.funnel.stages).toHaveLength(3);
    expect(a.series.active_enrollments.length).toBeGreaterThanOrEqual(1);
    expect(a.collecting).toBe(false);
  });

  test('backfillHistory seeds derivable cumulative days, global + per-program', async () => {
    const r = await backfillHistory({ days: 7 });
    expect(r.days).toBe(7);
    expect(r.programs).toBeGreaterThanOrEqual(1);
    const globalRows = await findActiveRowsWhere('MetricSnapshot', { scope: 'global', key: 'enrollments' });
    expect(globalRows.length).toBeGreaterThanOrEqual(1);
    // Per-program cumulative was seeded too (this program's enrollments today = 3).
    const progRows = await findActiveRowsWhere('MetricSnapshot', { scope: 'program', scopeId: programId, key: 'enrollments' });
    expect(progRows.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...progRows.map((x) => x.value))).toBe(3);
  });
});

describe('GET /api/analytics/*', () => {
  test('series requires analytics.read (non-admin forbidden)', async () => {
    const r = await request(app)
      .get('/api/analytics/series?key=active_enrollments')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(r.status).toBe(403);
  });

  test('series 400 without a key', async () => {
    const r = await request(app)
      .get('/api/analytics/series')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(400);
  });

  test('series returns collecting:true for a metric with no history', async () => {
    const r = await request(app)
      .get(`/api/analytics/series?key=never_tracked_${uniq()}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
    expect(r.body.meta.collecting).toBe(true);
  });

  test('funnel returns stages for admin', async () => {
    const r = await request(app)
      .get(`/api/analytics/funnel?programId=${programId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.data.stages).toHaveLength(3);
  });
});
