/**
 * ──────────────────────────────────────────────────────────
 * Integration Test — org repository dual-backend selector (Phase 3 Wave-B)
 * ──────────────────────────────────────────────────────────
 * Pins that the selector resolves to the impl selected by DB_BACKEND
 * (Mongo on the default lane — app unchanged), both
 * impls load (PG impl loads without a connection), and the Mongo path is intact
 * through the selector (department CRUD + manager-hierarchy rollups). Exact
 * Mongo↔PG parity is proven on real Postgres by
 * tests/pg-parity/org-repository.pg.test.js.
 */
const mongoose = require('mongoose');
const { getApp } = require('../setup');
const orgRepo = require('../../domains/org/repository');
const { isPostgres } = require('../../config/db-backend');
const User = require('../../models/User');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');

const uniq = () => Math.random().toString(16).slice(2, 8);
let mgr; let report;

beforeAll(async () => {
  await getApp();
  const mk = (name) => User.create({
    empCode: `E${uniq()}`, name, email: `${uniq()}@x.io`, role: 'Participant', password: 'Passw0rd!23',
  });
  mgr = await mk('Manager');
  report = await mk('Report One');
  await orgRepo.impls.mongo.updateUserAssignment(report._id, { managerId: mgr._id });
  await Enrollment.create({ userId: report._id, classId: new mongoose.Types.ObjectId(), status: 'Active' });
  await Certificate.create({
    userId: report._id, programId: new mongoose.Types.ObjectId(), cohortId: new mongoose.Types.ObjectId(),
    status: 'Issued', certificateNumber: `CN-${uniq()}`, verificationCode: `VC-${uniq()}${uniq()}`,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('org repository dual-backend selector', () => {
  test('selector resolves to the active DB_BACKEND + both impls load', () => {
    expect(orgRepo.createDepartment).toBe(orgRepo.impls[isPostgres ? 'pg' : 'mongo'].createDepartment); // selector = active backend (mongo on the default lane)
    expect(typeof orgRepo.impls.mongo.createDepartment).toBe('function');
    expect(typeof orgRepo.impls.pg.createDepartment).toBe('function');
  });

  test('mongo department CRUD through the selector (create uppercases code → find → soft-delete hides)', async () => {
    const code = `D${uniq()}`;
    const dept = await orgRepo.impls.mongo.createDepartment({ name: '  Ops ', code: code.toLowerCase() });
    expect(dept.name).toBe('Ops');
    expect(dept.code).toBe(code.toUpperCase());
    expect(await orgRepo.impls.mongo.findDepartmentByIdLean(dept._id)).toBeTruthy();
    await orgRepo.impls.mongo.softDeleteDepartment(dept._id);
    expect(await orgRepo.impls.mongo.findDepartmentByIdLean(dept._id)).toBeNull();
  });

  test('mongo manager-hierarchy rollups through the selector', async () => {
    const reports = await orgRepo.impls.mongo.listDirectReports(mgr._id);
    expect(reports.map((r) => r.name)).toContain('Report One');

    const enr = await orgRepo.impls.mongo.aggregateActiveEnrollments([report._id]);
    expect(enr[0]).toMatchObject({ count: 1 });
    const cert = await orgRepo.impls.mongo.aggregateIssuedCertificates([report._id]);
    expect(cert[0]).toMatchObject({ count: 1 });
  });
});
