const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { deleteActiveRowsWhere } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');
const branding = require('../../lib/branding');

// TMS.update gap #5 — branding & templates designer: singleton TenantConfig over
// /api/branding (branding.manage), feeding the cached email + certificate
// pipeline (lib/branding).

let app, tokens, seed, csrf;
beforeAll(async () => { app = await getApp(); tokens = getTokens(); seed = getSeedData(); csrf = await getCsrfHeaders(app); });
afterEach(async () => {
  await Promise.all([
    deleteActiveRowsWhere('TenantConfig', {}),
    deleteActiveRowsWhere('Certificate', {}),
  ]);
  branding.setBrandingCache(branding.DEFAULTS); // reset the cache between tests
});
afterAll(async () => { await teardown(); });

const asAdmin = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
const asTeacher = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.teacher}`).set(csrf);

describe('Branding — CRUD + cache', () => {
  it('returns the default singleton (org "TMS") for an unconfigured tenant', async () => {
    const res = await asAdmin('get', '/api/branding');
    expect(res.status).toBe(200);
    expect(res.body.data.orgName).toBe('TMS');
    expect(res.body.data.certificateTitle).toBe('Certificate of Completion');
    expect(res.body.data.accentColor).toBe('#3b6fe0');
  });

  it('updates branding and refreshes the pipeline cache immediately', async () => {
    const res = await asAdmin('put', '/api/branding')
      .send({ orgName: 'Northwind Group', accentColor: '#1f9a8a', certificateTitle: 'Certificate of Achievement' });
    expect(res.status).toBe(200);
    expect(res.body.data.orgName).toBe('Northwind Group');

    // The in-memory cache the email/cert pipelines read is refreshed on save.
    expect(branding.getBrandingCached().orgName).toBe('Northwind Group');
    expect(branding.emailSignature()).toBe('Northwind Group Training System');
  });

  it('rejects a non-hex accent (400)', async () => {
    const res = await asAdmin('put', '/api/branding').send({ accentColor: 'teal' });
    expect(res.status).toBe(400);
  });

  it('denies access to non-admins (Teacher 403) and rejects anon (401)', async () => {
    expect((await asTeacher('get', '/api/branding')).status).toBe(403);
    expect((await asTeacher('put', '/api/branding').send({ orgName: 'X' })).status).toBe(403);
    expect((await request(app).get('/api/branding')).status).toBe(401);
  });
});

describe('Branding — feeds the certificate verification surface', () => {
  it('exposes the configured branding on the public verification response', async () => {
    await asAdmin('put', '/api/branding').send({ orgName: 'Northwind Group', certificateTitle: 'Certificate of Achievement' });
    const cert = await fx.createCertificate({
      certificateNumber: 'CERT-B-1', verificationCode: 'verify-b-1',
      userId: seed.leader._id, cohortId: seed.class1._id, status: 'Issued', learnerName: 'Team Leader',
    });

    const res = await request(app).get(`/api/learning/certificates/verify/${cert.verificationCode}`);
    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.branding.orgName).toBe('Northwind Group');
    expect(res.body.data.branding.certificateTitle).toBe('Certificate of Achievement');
  });
});
