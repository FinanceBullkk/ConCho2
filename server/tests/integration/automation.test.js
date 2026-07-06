const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');
const AutomationRule = require('../../models/AutomationRule');
const NotificationLog = require('../../models/NotificationLog');
const EVENTS = require('../../domains/_shared/events');
const { handleEvent } = require('../../domains/automation/runner');
const { seedSystemRules } = require('../../domains/automation/seed');

// TMS.update gap #3 — the no-code automation engine: CRUD over /api/automation
// (automation.manage), plus the event-bus runner (opt-in, fail-soft).

let app, tokens, csrf;
beforeAll(async () => { app = await getApp(); tokens = getTokens(); csrf = await getCsrfHeaders(app); });
afterEach(async () => {
  await AutomationRule.deleteMany({});
  await NotificationLog.deleteMany({ type: 'automation_notice' });
});
afterAll(async () => { await teardown(); });

const asAdmin = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
const objId = () => new mongoose.Types.ObjectId().toString();

describe('Automation — CRUD', () => {
  it('lists rules with trigger + action libraries', async () => {
    const res = await asAdmin('get', '/api/automation/rules');
    expect(res.status).toBe(200);
    expect(res.body.data.triggers).toContain(EVENTS.CERTIFICATE_ISSUED);
    expect(res.body.data.actionTypes).toEqual(['notify', 'log']);
  });

  it('creates (disabled by default), toggles enabled, and deletes', async () => {
    const create = await asAdmin('post', '/api/automation/rules')
      .send({ name: 'Notify on cert', trigger: EVENTS.CERTIFICATE_ISSUED, actions: [{ type: 'notify', params: { message: 'hi' } }] });
    expect(create.status).toBe(201);
    expect(create.body.data.enabled).toBe(false); // opt-in

    const id = create.body.data._id;
    const upd = await asAdmin('put', `/api/automation/rules/${id}`).send({ enabled: true });
    expect(upd.body.data.enabled).toBe(true);

    const del = await asAdmin('delete', `/api/automation/rules/${id}`);
    expect(del.status).toBe(200);
  });

  it('rejects an uncatalogued trigger (400) and a non-admin (403)', async () => {
    const bad = await asAdmin('post', '/api/automation/rules')
      .send({ name: 'X', trigger: 'made.up', actions: [{ type: 'notify' }] });
    expect(bad.status).toBe(400);

    const teacher = await request(app).get('/api/automation/rules').set('Authorization', `Bearer ${tokens.teacher}`);
    expect(teacher.status).toBe(403);
  });

  it('refuses to delete a seeded system rule (400)', async () => {
    await seedSystemRules();
    const sys = await AutomationRule.findOne({ system: true });
    const del = await asAdmin('delete', `/api/automation/rules/${sys._id}`);
    expect(del.status).toBe(400);
  });
});

describe('Automation — runner', () => {
  it('runs an enabled matching rule: notifies + increments runCount', async () => {
    const userId = objId();
    const rule = await AutomationRule.create({
      name: 'r', trigger: EVENTS.CERTIFICATE_ISSUED, actions: [{ type: 'notify', params: { message: 'done' } }], enabled: true,
    });
    await handleEvent(EVENTS.CERTIFICATE_ISSUED, { userId, certificateNumber: 'CERT-1', programName: 'P' });

    const rows = await NotificationLog.find({ type: 'automation_notice', recipientUserId: userId });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.message).toBe('done');
    const after = await readActiveRow('AutomationRule', rule._id);
    expect(after.runCount).toBe(1);
  });

  it('skips a disabled rule and a non-matching condition', async () => {
    const userId = objId();
    await AutomationRule.create({ name: 'disabled', trigger: EVENTS.CERTIFICATE_ISSUED, actions: [{ type: 'notify' }], enabled: false });
    await AutomationRule.create({
      name: 'cond', trigger: EVENTS.CERTIFICATE_ISSUED,
      conditions: [{ field: 'programName', op: 'eq', value: 'OTHER' }], actions: [{ type: 'notify' }], enabled: true,
    });
    await handleEvent(EVENTS.CERTIFICATE_ISSUED, { userId, certificateNumber: 'C2', programName: 'P' });

    const rows = await NotificationLog.find({ type: 'automation_notice', recipientUserId: userId });
    expect(rows).toHaveLength(0);
  });

  it('seeds the §9 flows idempotently (5 system rules, all disabled)', async () => {
    await seedSystemRules();
    await seedSystemRules();
    const rules = await AutomationRule.find({ system: true });
    expect(rules).toHaveLength(5);
    expect(rules.every((r) => !r.enabled)).toBe(true);
  });
});
