/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * The learning domain is the reference implementation. Pins that the DB_BACKEND
 * selector resolves to the Mongo impl by default (so the large existing learning
 * suite is unaffected), both impls load (PG without a connection), and the Mongo
 * program/cohort path is intact through the selector. Exact Mongo↔PG parity is
 * proven on real Postgres by tests/pg-parity/learning-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
require('../../models/Setting'); // Class.courseName validator
const repo = require('../../domains/learning/repository');

const uniq = () => Math.random().toString(16).slice(2, 6).toUpperCase();

beforeAll(async () => { await getApp(); });
afterAll(async () => { await mongoose.disconnect(); });

describe('learning repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(repo.createProgram).toBe(repo.impls.mongo.createProgram);
    expect(typeof repo.impls.mongo.createCohort).toBe('function');
    expect(typeof repo.impls.pg.createCohort).toBe('function');
    expect(typeof repo.impls.pg.findCohortById).toBe('function');
  });

  test('mongo program + cohort path through the selector', async () => {
    const code = `P-${uniq()}`;
    const name = `Program ${uniq()}`;
    const prog = await repo.impls.mongo.createProgram({ code, name, category: 'technical' });
    expect(prog.code).toBe(code.toUpperCase());

    const byName = await repo.impls.mongo.findProgramByName(name.toLowerCase());
    expect(byName).toBeTruthy(); // case-insensitive

    const cohort = await repo.impls.mongo.createCohort({ classCode: `C-${uniq()}`, courseName: name, programId: prog._id, totalSessions: 5 });
    const populated = await repo.impls.mongo.findCohortById(cohort._id);
    expect(populated.programId.code).toBe(code.toUpperCase()); // full populate

    await repo.impls.mongo.softDeleteCohort(cohort._id, new Date());
    expect(await repo.impls.mongo.findCohortById(cohort._id)).toBeNull();
    await repo.impls.mongo.restoreCohortById(cohort._id);
    expect(await repo.impls.mongo.findCohortById(cohort._id)).toBeTruthy();
  });
});
