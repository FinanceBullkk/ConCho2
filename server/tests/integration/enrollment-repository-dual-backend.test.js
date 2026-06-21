/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning/enrollment repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo enrollment spine is intact through the selector.
 * Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/enrollment-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/enrollment/repository');

let userId; let cohortId;
beforeAll(async () => { await getApp(); userId = new mongoose.Types.ObjectId(); cohortId = new mongoose.Types.ObjectId(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('learning/enrollment repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.insertActiveEnrollment).toBe(repo.impls.mongo.insertActiveEnrollment);
    expect(typeof repo.impls.mongo.insertActiveEnrollment).toBe('function');
    expect(typeof repo.impls.pg.insertActiveEnrollment).toBe('function');
    expect(typeof repo.impls.pg.findCohortCapacityPolicy).toBe('function');
  });

  test('mongo enrollment spine through the selector (insert → find → count → drop)', async () => {
    const created = await repo.impls.mongo.insertActiveEnrollment({ userId, classId: cohortId });
    expect(created.status).toBe('Active');
    expect(String(created.userId)).toBe(String(userId));

    const found = await repo.impls.mongo.findActiveCohortEnrollment(userId, cohortId);
    expect(found).toBeTruthy();
    expect(await repo.impls.mongo.countActiveCohortEnrollments(cohortId)).toBe(1);

    const dropped = await repo.impls.mongo.markDropped(found._id);
    expect(dropped.status).toBe('Dropped');
    expect(await repo.impls.mongo.countActiveCohortEnrollments(cohortId)).toBe(0); // no longer Active
  });
});
