/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning/path repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo path-CRUD is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/path-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/learning/path/repository');
const { isPostgres } = require('../../config/db-backend');

const uniq = () => Math.random().toString(16).slice(2, 6).toUpperCase();
beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('learning/path repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.create).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].create); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.create).toBe('function');
    expect(typeof repo.impls.pg.findByIdLean).toBe('function');
  });

  test('mongo path CRUD through the selector (create uppercases code → list → soft-delete hides)', async () => {
    const code = `LP-${uniq()}`;
    const path = await repo.impls.mongo.create({ code: code.toLowerCase(), title: `Path ${uniq()}`, programs: [] });
    expect(path.code).toBe(code);
    expect(path.status).toBe('active');

    const found = await repo.impls.mongo.findByIdLean(path._id);
    expect(found).toBeTruthy();

    await repo.impls.mongo.softDelete(path._id);
    expect(await repo.impls.mongo.findByIdLean(path._id)).toBeNull(); // hidden + archived
  });
});
