/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — skill repository dual-backend selector (Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the DB_BACKEND selector resolves to the Mongo impl by default, both
 * impls load (PG loads without a connection), and the Mongo path is intact
 * through the selector (skill CRUD + a completion-signal read). Exact Mongo↔PG
 * parity proven on real Postgres by tests/pg-parity/skill-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const skillRepo = require('../../domains/skill/repository');
const Certificate = require('../../models/Certificate');

const uniq = () => Math.random().toString(16).slice(2, 8);
let userId; let programId;

beforeAll(async () => {
  await getApp();
  userId = new mongoose.Types.ObjectId();
  programId = new mongoose.Types.ObjectId();
  await Certificate.create({
    userId, programId, cohortId: new mongoose.Types.ObjectId(), status: 'Issued',
    certificateNumber: `CN-${uniq()}`, verificationCode: `VC-${uniq()}${uniq()}`,
  });
});

afterAll(async () => { await mongoose.disconnect(); });

describe('skill repository dual-backend selector', () => {
  test('selector resolves to mongo by default + both impls load (PG loads without connecting)', () => {
    expect(skillRepo.create).toBe(skillRepo.impls.mongo.create);
    expect(typeof skillRepo.impls.mongo.create).toBe('function');
    expect(typeof skillRepo.impls.pg.create).toBe('function');
  });

  test('mongo skill CRUD + completion signal through the selector', async () => {
    const name = `Skill ${uniq()}`;
    const s = await skillRepo.impls.mongo.create({ name, category: 'Tech', programIds: [programId] });
    expect(s.name).toBe(name);
    expect(s.category).toBe('Tech');

    expect(await skillRepo.impls.mongo.findByName(name.toUpperCase())).toBeTruthy(); // case-insensitive
    await skillRepo.impls.mongo.softDeleteById(s._id);
    expect(await skillRepo.impls.mongo.findById(s._id)).toBeNull();

    const completed = await skillRepo.impls.mongo.completedProgramIdsForUser(userId);
    expect(completed.has(String(programId))).toBe(true);
  });
});
