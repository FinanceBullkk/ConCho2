/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — session-type repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND (Mongo on the default lane — app unchanged), both
 * impls load (PG loads without a connection), and the Mongo catalog path is
 * intact through the selector. Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/session-type-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const typeRepo = require('../../domains/session-type/repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('session-type repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(typeRepo.create).toBe(typeRepo.impls[isPostgres ? 'pg' : 'mongo'].create); // selector = active backend (mongo on the default lane)
    expect(typeof typeRepo.impls.mongo.create).toBe('function');
    expect(typeof typeRepo.impls.pg.create).toBe('function');
  });

  test('mongo catalog CRUD through the selector (create defaults → list → maxOrder → soft-delete hides)', async () => {
    const a = await typeRepo.impls.mongo.create({ name: '  Workshop ' });
    expect(a.name).toBe('Workshop');
    expect(a.color).toBe('#6366f1');       // schema default
    expect(a.defaultDurationMin).toBe(60); // schema default
    expect(a.order).toBe(0);

    const b = await typeRepo.impls.mongo.create({ name: 'Coaching', order: 5 });
    expect(await typeRepo.impls.mongo.maxOrder()).toBe(5);

    const list = await typeRepo.impls.mongo.list();
    expect(list.map((t) => t.name)).toEqual(['Workshop', 'Coaching']); // order 0 then 5

    await typeRepo.impls.mongo.softDelete(b._id);
    expect(await typeRepo.impls.mongo.findByIdLean(b._id)).toBeNull();
    expect(await typeRepo.impls.mongo.maxOrder()).toBe(0); // Coaching gone
  });
});
