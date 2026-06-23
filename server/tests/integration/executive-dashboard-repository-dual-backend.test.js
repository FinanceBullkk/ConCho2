/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — executive-dashboard repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default and both impls load (PG without
 * a connection). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/executive-dashboard-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/dashboard/executive-repository');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('executive-dashboard repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.activeEmployeeCount).toBe(repo.impls.mongo.activeEmployeeCount);
    expect(typeof repo.impls.mongo.certificateValidityRollup).toBe('function');
    expect(typeof repo.impls.pg.coverageByDepartment).toBe('function');
    expect(typeof repo.impls.pg.issuedProgramSetsByUser).toBe('function');
  });

  test('mongo cost-config upsert through the selector returns {before, after}', async () => {
    const r1 = await repo.impls.mongo.upsertCostConfig({ hourly: 50 });
    expect(r1.after).toEqual({ hourly: 50 });
    const r2 = await repo.impls.mongo.upsertCostConfig({ hourly: 75 });
    expect(r2.before).toEqual({ hourly: 50 });
    expect(r2.after).toEqual({ hourly: 75 });
  });
});
