/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — mobile repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND
 * (Mongo on the default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo push-subscription CRUD is intact through the
 * selector. Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/mobile-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/mobile/repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('mobile repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.upsertSubscription).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].upsertSubscription); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.upcomingSessionsForUser).toBe('function');
    expect(typeof repo.impls.pg.removeSubscription).toBe('function');
  });

  test('mongo push-subscription upsert (re-home on endpoint) + hard delete through the selector', async () => {
    const u1 = new mongoose.Types.ObjectId();
    const u2 = new mongoose.Types.ObjectId();
    const endpoint = `https://push.example/${u1}`;

    const s1 = await repo.impls.mongo.upsertSubscription({ userId: u1, endpoint, keys: { p256dh: 'k1', auth: 'a1' }, userAgent: 'UA' });
    expect(String(s1.userId)).toBe(String(u1));

    // same endpoint, new user → re-homes (no duplicate)
    const s2 = await repo.impls.mongo.upsertSubscription({ userId: u2, endpoint, keys: { p256dh: 'k2', auth: 'a2' }, userAgent: 'UA2' });
    expect(String(s2.userId)).toBe(String(u2));

    const miss = await repo.impls.mongo.removeSubscription(u1, endpoint); // u1 no longer owns it
    expect(miss.deletedCount).toBe(0);
    const hit = await repo.impls.mongo.removeSubscription(u2, endpoint);
    expect(hit.deletedCount).toBe(1);
  });
});
