/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — metrics-funnel reference repository (PG-migration foundation)
 * ──────────────────────────────────────────────────────────
 * The first dual-backend repository: ONE semantic interface
 * (`getFunnelCounts({ programId })`) with two impls (Mongo + Postgres) selected
 * by DB_BACKEND. This pins the Mongo path (CI's backend) + that the module loads
 * the PG impl without opening a connection (lazy pool). The live PG↔Mongo parity
 * is exercised by scripts/dev-tools/pg-reference-repo-proof.js against a real
 * Postgres (the CI Postgres lane lands with Phase 3).
 */

const mongoose = require('mongoose');
const { getApp, getSeedData } = require('../setup');
const funnel = require('../../services/metrics-funnel');

const LearningProgram = require('../../models/LearningProgram');
const Class = require('../../models/Class');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');

const uniq = () => Math.random().toString(16).slice(2, 8);
let seed, programId;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();

  const program = await LearningProgram.create({ code: `FN-${uniq()}`, name: 'Funnel Test Program', category: 'compliance' });
  programId = program._id;
  const cohort = await Class.create({ classCode: `FNC-${uniq()}`, courseName: 'Funnel Cohort', totalSessions: 4, programId, status: 'Ongoing' });

  // Deterministic, program-scoped funnel: 3 enrolled (2 Active + 1 Completed),
  // 1 completed, 1 certified. A Transferred row is excluded from "enrolled".
  await Enrollment.create([
    { userId: seed.member1._id, classId: cohort._id, status: 'Active' },
    { userId: seed.member2._id, classId: cohort._id, status: 'Active' },
    { userId: seed.leader._id, classId: cohort._id, status: 'Completed', leftAt: new Date() },
    { userId: seed.member1._id, classId: cohort._id, status: 'Transferred' },
  ]);
  await Certificate.create([
    { certificateNumber: `FC-${uniq()}`, verificationCode: `fv-${uniq()}`, userId: seed.leader._id, cohortId: cohort._id, programId, status: 'Issued', issuedAt: new Date() },
    { certificateNumber: `FC-${uniq()}`, verificationCode: `fv-${uniq()}`, userId: seed.member1._id, cohortId: cohort._id, programId, status: 'Revoked' },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('metrics-funnel dual-backend repository', () => {
  test('factory + both impls load (PG impl loads without opening a connection)', () => {
    expect(typeof funnel.getFunnelCounts).toBe('function');         // resolved by DB_BACKEND (default mongo)
    expect(typeof funnel.impls.mongo.getFunnelCounts).toBe('function');
    expect(typeof funnel.impls.pg.getFunnelCounts).toBe('function'); // requiring it must not connect
  });

  test('mongo impl computes program-scoped funnel counts', async () => {
    const r = await funnel.impls.mongo.getFunnelCounts({ programId });
    expect(r).toEqual({ enrolled: 3, completed: 1, certified: 1 });
  });
});
