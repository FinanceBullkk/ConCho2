/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — A3 role-based compliance matrix (Horizon 1)
 * ──────────────────────────────────────────────────────────
 * RequiredTraining CRUD (compliance.manage) + derived matrix/per-user
 * compliance (report.read): completion via Certificate, overdue via
 * dueWithinDays, recurrence cadence.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');

const Department = require('../../models/Department');
const User = require('../../models/User');
const LearningProgram = require('../../models/LearningProgram');
const Certificate = require('../../models/Certificate');
const { findActiveRowWhere, updateActiveRow } = require('../pg-test-utils');

let app, tokens, seed, csrf;
const uniq = () => Math.random().toString(16).slice(2, 8);
const settle = () => new Promise((r) => setTimeout(r, 80));

let dept, program, compliantUser, pendingUser, reqId;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  dept = await Department.create({ name: `Compliance Dept ${uniq()}`, code: `CD${uniq()}` });
  program = await LearningProgram.create({ code: `CMP-${uniq()}`, name: 'Mandatory Safety', category: 'compliance' });

  compliantUser = await User.create({
    empCode: `CC${uniq()}`, name: 'Compliant One', role: 'Participant',
    password: 'disposable-pwd-12345', status: 'Active', departmentId: dept._id,
  });
  pendingUser = await User.create({
    empCode: `CP${uniq()}`, name: 'Pending One', role: 'Participant',
    password: 'disposable-pwd-12345', status: 'Active', departmentId: dept._id,
  });

  // compliantUser holds an issued cert for the target program → compliant.
  await Certificate.create({
    certificateNumber: `CERT-CMP-${uniq()}`, verificationCode: `vc-cmp-${uniq()}`,
    userId: compliantUser._id, cohortId: seed.class1._id, programId: program._id,
    status: 'Issued', issuedAt: new Date(),
  });

  const r = await request(app)
    .post('/api/compliance/requirements')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .set(csrf)
    .send({
      appliesTo: { type: 'department', value: String(dept._id) },
      target: { kind: 'program', id: String(program._id) },
      recurrence: 'once', dueWithinDays: 30, label: 'Mandatory Safety',
    });
  expect(r.status).toBe(201);
  reqId = r.body.data._id;
});

afterAll(async () => {
  await mongoose.disconnect();
});

const myRow = (body) => body.data.rows.find((x) => String(x.id) === String(reqId));

describe('compliance matrix', () => {
  test('creating a requirement audits + the matrix reflects it immediately', async () => {
    await settle();
    // Audit rows are written through the ported repo (PG-only on the pg lane),
    // so read from the active backend instead of Mongoose.
    const audit = await findActiveRowWhere('AuditLog', { entity: 'RequiredTraining', action: 'created' });
    expect(audit).not.toBeNull();

    const r = await request(app).get('/api/compliance/matrix').set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    const row = myRow(r.body);
    expect(row).toBeTruthy();
    expect(row.total).toBe(2);
    expect(row.compliant).toBe(1);   // compliantUser has the cert
    expect(row.pending).toBe(1);     // pendingUser, no cert, due window open
    expect(row.overdue).toBe(0);
    expect(row.pct).toBe(50);
  });

  test('per-user compliance: compliant vs pending', async () => {
    const a = await request(app).get(`/api/compliance/user/${compliantUser._id}`).set('Authorization', `Bearer ${tokens.admin}`);
    expect(a.status).toBe(200);
    expect(a.body.data.items.find((i) => String(i.requirementId) === String(reqId)).status).toBe('compliant');

    const b = await request(app).get(`/api/compliance/user/${pendingUser._id}`).set('Authorization', `Bearer ${tokens.admin}`);
    expect(b.body.data.items.find((i) => String(i.requirementId) === String(reqId)).status).toBe('pending');
  });

  test('overdue once the due window has passed', async () => {
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    // The requirement is created through the ported compliance repo (PG-only on
    // the lane), so a raw Mongo updateOne can't backdate it — write the active
    // backend. The user exists on both (Mongoose-seeded → mirrored); its raw
    // updateOne backdates Mongo and the mirror carries created_at to PG.
    await updateActiveRow('RequiredTraining', reqId, { createdAt: past });
    await User.collection.updateOne({ _id: pendingUser._id }, { $set: { createdAt: past } });

    const r = await request(app).get('/api/compliance/matrix').set('Authorization', `Bearer ${tokens.admin}`);
    const row = myRow(r.body);
    expect(row.overdue).toBe(1);
    expect(row.compliant).toBe(1);
    expect(row.nonCompliant.find((n) => String(n.userId) === String(pendingUser._id)).status).toBe('overdue');
  });
});

describe('authz', () => {
  test('defining a requirement needs compliance.manage (Teacher 403)', async () => {
    const r = await request(app)
      .post('/api/compliance/requirements')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ appliesTo: { type: 'all', value: '' }, target: { kind: 'program', id: String(program._id) } });
    expect(r.status).toBe(403);
  });

  test('reading the matrix needs report.read (Participant 403, Teacher 200)', async () => {
    const denied = await request(app).get('/api/compliance/matrix').set('Authorization', `Bearer ${tokens.leader}`);
    expect(denied.status).toBe(403);
    const ok = await request(app).get('/api/compliance/matrix').set('Authorization', `Bearer ${tokens.teacher}`);
    expect(ok.status).toBe(200);
  });

  test('invalid appliesTo (missing value for non-all) → 400', async () => {
    const r = await request(app)
      .post('/api/compliance/requirements')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ appliesTo: { type: 'role', value: '' }, target: { kind: 'program', id: String(program._id) } });
    expect(r.status).toBe(400);
  });
});
