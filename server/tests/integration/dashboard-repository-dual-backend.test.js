/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning/dashboard repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the
 * default lane — app unchanged) and both impls load (PG without
 * a connection). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/dashboard-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/dashboard/repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('learning/dashboard repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.attendanceTotals).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].attendanceTotals); // selector = active backend (mongo on the default lane)
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
