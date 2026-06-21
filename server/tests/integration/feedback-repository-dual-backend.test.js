/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning/feedback repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo feedback path is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/feedback-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/feedback/repository');

let cohortId; let userId;
beforeAll(async () => { await getApp(); cohortId = new mongoose.Types.ObjectId(); userId = new mongoose.Types.ObjectId(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('learning/feedback repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.upsertFeedback).toBe(repo.impls.mongo.upsertFeedback);
    expect(typeof repo.impls.mongo.upsertFeedback).toBe('function');
    expect(typeof repo.impls.pg.upsertFeedback).toBe('function');
    expect(typeof repo.isCohortParticipant).toBe('function'); // pure helper re-exported
  });

  test('mongo feedback upsert path through the selector (insert → idempotent re-submit → find)', async () => {
    const a = await repo.impls.mongo.upsertFeedback({ cohortId, userId, rating: 5, comment: 'great' });
    expect(a.rating).toBe(5);

    const b = await repo.impls.mongo.upsertFeedback({ cohortId, userId, rating: 3, comment: 'changed' });
    expect(String(b._id)).toBe(String(a._id)); // SAME row (idempotent)
    expect(b.rating).toBe(3);

    const found = await repo.impls.mongo.findFeedback(cohortId, userId);
    expect(found.comment).toBe('changed');
    const list = await repo.impls.mongo.listFeedback({ cohortId });
    expect(list.length).toBe(1);
  });
});
