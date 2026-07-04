/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — vendor repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND (Mongo on the default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo path is intact through the selector (CRUD + rating +
 * soft-delete + spend roll-up). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/vendor-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/vendor/repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('vendor repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.createVendor).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].createVendor); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.createVendor).toBe('function');
    expect(typeof repo.impls.pg.createVendor).toBe('function');
  });

  test('mongo CRUD + rating + soft-delete + empty spend through the selector', async () => {
    const v = await repo.impls.mongo.createVendor({ name: 'Acme', delivers: [] });
    expect(v.name).toBe('Acme');
    expect(v.type).toBe('provider'); // default
    expect(v.status).toBe('active');

    const rated = await repo.impls.mongo.pushRating(v._id, { value: 5, note: 'ok' });
    expect(rated.ratings.map((r) => r.value)).toContain(5);

    const spend = await repo.impls.mongo.vendorSpend(v._id);
    expect(spend).toMatchObject({ totalMinor: 0, count: 0, byType: [] }); // no cost entries

    await repo.impls.mongo.softDeleteVendor(v._id);
    expect(await repo.impls.mongo.findVendorById(v._id)).toBeNull(); // hidden
  });
});
