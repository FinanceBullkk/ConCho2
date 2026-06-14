/**
 * Integration — /api/custom-fields (Studio ▸ Custom fields) + Program round-trip.
 *
 * Admin-only (settings.manage) CRUD over admin-defined custom field
 * definitions, plus the end-to-end loop: a value for a defined field persists
 * on LearningProgram.customFields and comes back on read.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getCsrfHeaders } = require('../setup');

let app, tokens, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await mongoose.disconnect();
});

const asAdmin = (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

describe('Custom fields — definition CRUD', () => {
  it('creates, lists, updates and soft-deletes a Program text field (admin)', async () => {
    const create = await asAdmin('post', '/api/custom-fields')
      .send({ entity: 'Program', key: 'budget_code', label: 'Budget code', type: 'text' });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ entity: 'Program', key: 'budget_code', type: 'text' });
    const id = create.body.data._id;

    const list = await asAdmin('get', '/api/custom-fields?entity=Program');
    expect(list.status).toBe(200);
    expect(list.body.data.some((d) => d.key === 'budget_code')).toBe(true);

    const update = await asAdmin('put', `/api/custom-fields/${id}`).send({ label: 'Budget code (FY)' });
    expect(update.status).toBe(200);
    expect(update.body.data.label).toBe('Budget code (FY)');

    const del = await asAdmin('delete', `/api/custom-fields/${id}`);
    expect(del.status).toBe(200);
    const afterDelete = await asAdmin('get', '/api/custom-fields?entity=Program');
    expect(afterDelete.body.data.some((d) => d._id === id)).toBe(false);
  });

  it('rejects a select field with no options (400)', async () => {
    const res = await asAdmin('post', '/api/custom-fields')
      .send({ entity: 'Program', key: 'theme', label: 'Theme', type: 'select', options: [] });
    expect(res.status).toBe(400);
  });

  it('denies a non-admin (Teacher) with 403', async () => {
    const res = await request(app)
      .post('/api/custom-fields')
      .set('Authorization', `Bearer ${tokens.teacher}`).set(csrf)
      .send({ entity: 'Program', key: 'x', label: 'X', type: 'text' });
    expect(res.status).toBe(403);
  });
});

describe('Custom fields — value round-trip on LearningProgram', () => {
  it('persists customFields on a program and returns them on create', async () => {
    const res = await asAdmin('post', '/api/learning/programs').send({
      code: `CF-${Date.now().toString(36).toUpperCase()}`,
      name: 'Custom Fields Program',
      customFields: { budget_code: 'FY26-OPS', theme: 'Leadership' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.customFields).toEqual({ budget_code: 'FY26-OPS', theme: 'Leadership' });
  });
});

describe('Custom fields — Cohort entity + value round-trip', () => {
  it('accepts a Cohort definition (admin)', async () => {
    const res = await asAdmin('post', '/api/custom-fields')
      .send({ entity: 'Cohort', key: 'cost_center', label: 'Cost center', type: 'text' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ entity: 'Cohort', key: 'cost_center' });
  });

  it('persists + updates customFields on a cohort (Class)', async () => {
    const program = await asAdmin('post', '/api/learning/programs').send({
      code: `CFC-${Date.now().toString(36).toUpperCase()}`,
      name: 'Cohort CF Program',
    });
    expect(program.status).toBe(201);

    const created = await asAdmin('post', '/api/learning/cohorts').send({
      programId: program.body.data._id,
      customFields: { cost_center: 'CC-100' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.customFields).toEqual({ cost_center: 'CC-100' });

    const updated = await asAdmin('put', `/api/learning/cohorts/${created.body.data._id}`)
      .send({ customFields: { cost_center: 'CC-200' } });
    expect(updated.status).toBe(200);
    expect(updated.body.data.customFields).toEqual({ cost_center: 'CC-200' });
  });
});
