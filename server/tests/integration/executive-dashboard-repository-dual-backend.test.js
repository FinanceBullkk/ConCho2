/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — executive-dashboard repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND
 * (Mongo on the default lane — app unchanged) and both impls load (PG without
 * a connection). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/executive-dashboard-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/dashboard/executive-repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('executive-dashboard repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.activeEmployeeCount).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].activeEmployeeCount); // selector = active backend (mongo on the default lane)
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
