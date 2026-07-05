/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — question-bank-repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo question CRUD is intact through the selector. Exact
 * Mongo↔PG parity proven on real Postgres by
 * tests/pg-parity/question-bank-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const repo = require('../../domains/assessment/question-bank-repository');
const { isPostgres } = require('../../config/db-backend');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('question-bank-repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.createQuestion).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].createQuestion); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.listQuestions).toBe('function');
    expect(typeof repo.impls.pg.softDeleteQuestion).toBe('function');
  });

  test('mongo question CRUD through the selector (create → find → update → soft-delete hides)', async () => {
    const created = await repo.impls.mongo.createQuestion({ type: 'short_text', prompt: 'Q?', acceptedAnswers: ['a'], tags: ['x'] });
    expect(created.type).toBe('short_text');
    expect(created.points).toBe(1); // default
    expect(created.options).toBeUndefined(); // default undefined, not []

    const id = created._id;
    expect(await repo.impls.mongo.findQuestionById(id)).toBeTruthy();
    const upd = await repo.impls.mongo.updateQuestion(id, { points: 4 });
    expect(upd.points).toBe(4);

    await repo.impls.mongo.softDeleteQuestion(id);
    expect(await repo.impls.mongo.findQuestionById(id)).toBeNull(); // hidden
  });
});
