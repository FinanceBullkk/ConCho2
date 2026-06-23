/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — report presets repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo preset CRUD is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/report-presets-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/reports/presets-repository');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('report presets repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.create).toBe(repo.impls.mongo.create);
    expect(typeof repo.impls.mongo.list).toBe('function');
    expect(typeof repo.impls.pg.softDeleteById).toBe('function');
  });

  test('mongo preset CRUD through the selector (create defaults → find → update → soft-delete hides)', async () => {
    const preset = await repo.impls.mongo.create({ name: 'Tmp', filters: { role: 'Admin' } });
    expect(preset.kind).toBe('evidence');     // default
    expect(preset.schedule).toBe('none');     // default
    expect(preset.filters.programIds).toEqual([]); // subdoc default

    const id = preset._id;
    expect(await repo.impls.mongo.findById(id)).toBeTruthy();
    const upd = await repo.impls.mongo.updateById(id, { name: 'Tmp 2' });
    expect(upd.name).toBe('Tmp 2');

    await repo.impls.mongo.softDeleteById(id);
    expect(await repo.impls.mongo.findById(id)).toBeNull(); // hidden
  });
});
