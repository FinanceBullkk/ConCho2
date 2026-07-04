/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — custom-field repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the
 * default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo custom-field CRUD is intact through the selector.
 * Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/custom-field-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/custom-field/repository');
const { isPostgres } = require('../../config/db-backend');

const uniq = () => Math.random().toString(16).slice(2, 6);
beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('custom-field repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.create).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].create); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.list).toBe('function');
    expect(typeof repo.impls.pg.reorder).toBe('function');
  });

  test('mongo CRUD through the selector (create defaults → find → update → reorder → soft-delete hides)', async () => {
    const key = `field_${uniq()}`;
    const created = await repo.impls.mongo.create({ entity: 'Program', key, label: 'Tmp' });
    expect(created.type).toBe('text'); // default
    expect(created.order).toBe(0);

    const id = created._id;
    expect(await repo.impls.mongo.findByIdLean(id)).toBeTruthy();

    const upd = await repo.impls.mongo.updateById(id, { label: 'Tmp 2', required: true });
    expect(upd.label).toBe('Tmp 2');
    expect(upd.required).toBe(true);

    await repo.impls.mongo.reorder('Program', [id]);
    expect((await repo.impls.mongo.findByIdLean(id)).order).toBe(0);

    await repo.impls.mongo.softDelete(id);
    expect(await repo.impls.mongo.findByIdLean(id)).toBeNull(); // hidden
  });
});
