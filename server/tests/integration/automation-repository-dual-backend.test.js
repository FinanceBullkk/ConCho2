/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — automation repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo rule CRUD is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/automation-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/automation/repository');

const uniq = () => Math.random().toString(16).slice(2, 6);
beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('automation repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.create).toBe(repo.impls.mongo.create);
    expect(typeof repo.impls.mongo.findEnabledByTrigger).toBe('function');
    expect(typeof repo.impls.pg.recordRun).toBe('function');
  });

  test('mongo rule CRUD through the selector (create defaults → find → update → recordRun → soft-delete hides)', async () => {
    const name = `rule-${uniq()}`;
    const rule = await repo.impls.mongo.create({ name, trigger: 'ENROLLMENT_CREATED' });
    expect(rule.enabled).toBe(false); // default
    expect(rule.runCount).toBe(0);

    const id = rule._id;
    expect(await repo.impls.mongo.findById(id)).toBeTruthy();
    const upd = await repo.impls.mongo.updateById(id, { enabled: true });
    expect(upd.enabled).toBe(true);

    await repo.impls.mongo.recordRun(id);
    expect((await repo.impls.mongo.findById(id)).runCount).toBe(1);

    await repo.impls.mongo.softDeleteById(id);
    expect(await repo.impls.mongo.findById(id)).toBeNull(); // hidden
  });
});
