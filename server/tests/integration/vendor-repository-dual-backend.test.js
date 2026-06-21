/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — vendor repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo path is intact through the selector (CRUD + rating +
 * soft-delete + spend roll-up). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/vendor-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/vendor/repository');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('vendor repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.createVendor).toBe(repo.impls.mongo.createVendor);
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
