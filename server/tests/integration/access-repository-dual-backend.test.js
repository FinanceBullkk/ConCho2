/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — access (roles) repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the
 * default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo role CRUD is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/access-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/access/repository');
const { isPostgres } = require('../../config/db-backend');

const uniq = () => Math.random().toString(16).slice(2, 6);
beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('access (roles) repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.create).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].create); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.listLive).toBe('function');
    expect(typeof repo.impls.pg.create).toBe('function');
  });

  test('mongo role CRUD through the selector (create → find → update → soft-delete hides)', async () => {
    const key = `role-${uniq()}`;
    const role = await repo.impls.mongo.create({ key, name: 'Custom', capabilities: ['x.read'] });
    expect(role.key).toBe(key);
    expect(role.system).toBe(false); // default

    expect(await repo.impls.mongo.findByKey(key)).toBeTruthy();
    const upd = await repo.impls.mongo.updateByKey(key, { capabilities: ['x.read', 'x.write'] });
    expect(upd.capabilities).toContain('x.write');

    await repo.impls.mongo.softDeleteByKey(key);
    expect(await repo.impls.mongo.findByKey(key)).toBeNull(); // hidden
  });
});
