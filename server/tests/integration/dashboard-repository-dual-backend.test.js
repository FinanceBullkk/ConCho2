/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning/dashboard repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default and both impls load (PG without
 * a connection). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/dashboard-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/dashboard/repository');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('learning/dashboard repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.attendanceTotals).toBe(repo.impls.mongo.attendanceTotals);
    expect(typeof repo.impls.mongo.getSetupSignals).toBe('function');
    expect(typeof repo.impls.pg.headcountByDepartment).toBe('function');
    expect(typeof repo.impls.pg.feedbackStats).toBe('function');
  });

  test('mongo dashboard reads through the selector (org-wide attendance + setup signals)', async () => {
    const totals = await repo.impls.mongo.attendanceTotals(null);
    expect(totals).toHaveProperty('totalRecords');
    expect(totals).toHaveProperty('presentRecords');
    const signals = await repo.impls.mongo.getSetupSignals();
    expect(signals).toHaveProperty('departments');
    expect(signals).toHaveProperty('activeLearners');
  });
});
