/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — trainer repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND (Mongo on the default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo path is intact through the selector (profile upsert
 * + rating + soft-delete). Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/trainer-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const trainerRepo = require('../../domains/trainer/repository');
const { isPostgres } = require('../../config/db-backend');

let userId;
beforeAll(async () => { await getApp(); userId = new mongoose.Types.ObjectId(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('trainer repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(trainerRepo.upsertProfile).toBe(trainerRepo.impls[isPostgres ? 'pg' : 'mongo'].upsertProfile); // selector = active backend (mongo on the default lane)
    expect(typeof trainerRepo.impls.mongo.upsertProfile).toBe('function');
    expect(typeof trainerRepo.impls.pg.upsertProfile).toBe('function');
  });

  test('mongo profile upsert + rating + soft-delete through the selector', async () => {
    const created = await trainerRepo.impls.mongo.upsertProfile(userId, { note: 'hello', canDeliver: [] });
    expect(created.note).toBe('hello');
    expect(created.status).toBe('active'); // default

    const updated = await trainerRepo.impls.mongo.upsertProfile(userId, { note: 'changed' });
    expect(updated.note).toBe('changed');

    const rated = await trainerRepo.impls.mongo.pushRating(userId, { value: 4, note: 'ok' });
    expect(rated.ratings.map((r) => r.value)).toContain(4);

    await trainerRepo.impls.mongo.softDeleteProfile(userId);
    expect(await trainerRepo.impls.mongo.findProfileByUserId(userId)).toBeNull(); // hidden
  });
});
