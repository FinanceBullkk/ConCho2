/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — learning/completion repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins the DB_BACKEND selector → the impl selected by DB_BACKEND (Mongo on the
 * default lane — app unchanged), both impls load (PG without a
 * connection), and the Mongo completion-engine reads are intact through the
 * selector. Exact Mongo↔PG parity (engine + certificate CRUD + the QB-008 race)
 * is proven on real Postgres by tests/pg-parity/completion-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
require('../../models/Setting'); // Class.courseName validator
const repo = require('../../domains/learning/completion/repository');
const { isPostgres } = require('../../config/db-backend');
const Class = require('../../models/Class');

const uniq = () => Math.random().toString(16).slice(2, 6).toUpperCase();
let cohortId;

beforeAll(async () => {
  await getApp();
  const cohort = await Class.create({ classCode: `C-${uniq()}`, courseName: `Course ${uniq()}`, totalSessions: 4 });
  cohortId = cohort._id;
});
afterAll(async () => { await mongoose.disconnect(); });

describe('learning/completion repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(repo.createCertificate).toBe(repo.impls[isPostgres ? 'pg' : 'mongo'].createCertificate); // selector = active backend (mongo on the default lane)
    expect(typeof repo.impls.mongo.resolveCompletionContext).toBe('function');
    expect(typeof repo.impls.pg.createCertificate).toBe('function');
    expect(typeof repo.impls.pg.findPassingAttempt).toBe('function');
  });

  test('mongo completion-engine reads through the selector', async () => {
    const cohort = await repo.impls.mongo.findCohort(cohortId);
    expect(cohort.classCode).toBeTruthy();

    const ctx = await repo.impls.mongo.resolveCompletionContext(cohort);
    expect(ctx.policy).toMatchObject({ attendanceThresholdPercent: 0, requiresAssessment: false, requiresFeedback: false });
    expect(ctx.programId).toBeNull(); // no linked program → lenient default

    expect(await repo.impls.mongo.countCohortSessions(cohortId)).toBe(0);
    const userId = new mongoose.Types.ObjectId();
    expect(await repo.impls.mongo.findEvaluation(cohortId, userId)).toBeNull();
    expect(await repo.impls.mongo.findFeedback(cohortId, userId)).toBeNull();
    expect(await repo.impls.mongo.findPassingAttempt(cohortId, userId)).toBeNull();
    expect(await repo.impls.mongo.findActiveCertificate(userId, cohortId)).toBeNull();
  });
});
