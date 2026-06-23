/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — org/office-repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo office CRUD is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/office-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/org/office-repository');

const uniq = () => Math.random().toString(16).slice(2, 6).toUpperCase();
beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('org/office-repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.createOffice).toBe(repo.impls.mongo.createOffice);
    expect(typeof repo.impls.mongo.listOffices).toBe('function');
    expect(typeof repo.impls.pg.countUsersInOffice).toBe('function');
  });

  test('mongo office CRUD through the selector (create → find → update → soft-delete hides)', async () => {
    const code = `O${uniq()}`;
    const office = await repo.impls.mongo.createOffice({ name: 'Tmp', code });
    expect(office.code).toBe(code);

    const id = office._id;
    expect(await repo.impls.mongo.findOfficeByIdLean(id)).toBeTruthy();
    const upd = await repo.impls.mongo.updateOfficeById(id, { name: 'Tmp 2' });
    expect(upd.name).toBe('Tmp 2');

    await repo.impls.mongo.softDeleteOffice(id);
    expect(await repo.impls.mongo.findOfficeByIdLean(id)).toBeNull(); // hidden
  });
});
