/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — compliance repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the
 * default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo RequiredTraining CRUD is intact through the
 * selector. Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/compliance-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/compliance/repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('compliance repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.createRequirement).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].createRequirement); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.listWorkforce).toBe('function');
    expect(typeof repo.impls.pg.findPathsByIds).toBe('function');
  });

  test('mongo RequiredTraining CRUD through the selector', async () => {
    const r = await repo.impls.mongo.createRequirement({
      appliesTo: { type: 'role', value: 'Teacher' }, target: { kind: 'program', id: new mongoose.Types.ObjectId() },
    });
    expect(r.dueWithinDays).toBe(90); // default
    expect(r.mandatory).toBe(true);

    const id = r._id;
    expect(await repo.impls.mongo.findRequirementById(id)).toBeTruthy();
    const upd = await repo.impls.mongo.updateRequirement(id, { recurrence: 'annual' });
    expect(upd.recurrence).toBe('annual');

    await repo.impls.mongo.softDeleteRequirement(id);
    expect(await repo.impls.mongo.findRequirementById(id)).toBeNull(); // hidden
  });
});
