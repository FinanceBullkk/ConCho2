/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — branding repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → mongo by default, both impls load (PG without a
 * connection), and the Mongo singleton-config path is intact through the selector.
 * Exact Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/branding-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/branding/repository');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('branding repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.getSingleton).toBe(repo.impls.mongo.getSingleton);
    expect(typeof repo.impls.mongo.update).toBe('function');
    expect(typeof repo.impls.pg.getSingleton).toBe('function');
  });

  test('mongo singleton path through the selector (getSingleton defaults → update → re-read)', async () => {
    const cfg = await repo.impls.mongo.getSingleton();
    expect(cfg.key).toBe('default');
    expect(cfg.orgName).toBe('TMS'); // default

    const updated = await repo.impls.mongo.update({ orgName: 'Acme' });
    expect(updated.orgName).toBe('Acme');

    const again = await repo.impls.mongo.getSingleton();
    expect(again.orgName).toBe('Acme'); // same singleton, not reset
  });
});
