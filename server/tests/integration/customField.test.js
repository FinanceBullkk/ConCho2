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

  it('creates the extended types (number/multiselect/date/toggle/user) + showIn (gap #6)', async () => {
    const ms = await asAdmin('post', '/api/custom-fields')
      .send({ entity: 'Program', key: 'skills_ms', label: 'Skills', type: 'multiselect', options: ['SQL', 'Excel'], showIn: ['form', 'filter'] });
    expect(ms.status).toBe(201);
    expect(ms.body.data).toMatchObject({ type: 'multiselect', options: ['SQL', 'Excel'], showIn: ['form', 'filter'] });

    for (const [key, type] of [['grade_num', 'number'], ['hire_date', 'date'], ['is_active', 'toggle'], ['owner_user', 'user']]) {
      const res = await asAdmin('post', '/api/custom-fields').send({ entity: 'Program', key, label: key, type });
      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe(type);
      expect(res.body.data.showIn).toEqual(['form']); // server default
    }
  });

  it('rejects a multiselect with no options (400)', async () => {
    const res = await asAdmin('post', '/api/custom-fields')
      .send({ entity: 'Program', key: 'ms_empty', label: 'MS', type: 'multiselect', options: [] });
    expect(res.status).toBe(400);
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
