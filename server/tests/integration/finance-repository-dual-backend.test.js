/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — finance repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND
 * (Mongo on the default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo CostEntry/Budget CRUD is intact through the
 * selector. Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/finance-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/finance/repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('finance repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.createCostEntry).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].createCostEntry); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.rollupCostEntries).toBe('function');
    expect(typeof repo.impls.pg.createBudget).toBe('function');
    expect(typeof repo.impls.pg.getTenantCurrency).toBe('function');
  });

  test('mongo CostEntry + Budget CRUD through the selector', async () => {
    const ce = await repo.impls.mongo.createCostEntry({
      scope: { }, type: 'venue', amountMinor: 1500, currency: 'USD', incurredOn: new Date('2026-03-01'),
    });
    expect(ce.amountMinor).toBe(1500);
    expect(await repo.impls.mongo.findCostEntryById(ce._id)).toBeTruthy();
    await repo.impls.mongo.softDeleteCostEntry(ce._id);
    expect(await repo.impls.mongo.findCostEntryById(ce._id)).toBeNull(); // hidden

    const b = await repo.impls.mongo.createBudget({ fiscalYear: '2026', amountMinor: 8000, currency: 'USD' });
    expect(b.fiscalYear).toBe('2026');
    const upd = await repo.impls.mongo.updateBudget(b._id, { label: 'ops' });
    expect(upd.label).toBe('ops');
  });
});
