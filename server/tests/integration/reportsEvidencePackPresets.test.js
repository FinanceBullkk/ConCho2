const request = require('supertest');
const { getApp, getTokens, teardown, getCsrfHeaders } = require('../setup');
const { pollUntil, findActiveAuditRow } = require('../pg-test-utils');

// Audit writes are fire-and-forget — a fixed sleep flakes under full-suite
// load (seen on the pg lane). Poll briefly instead; assertions stay strict.
const waitForAuditRow = (filter) => pollUntil(() => findActiveAuditRow(filter));
const AuditLog = require('../../models/AuditLog');
const ReportPreset = require('../../models/ReportPreset');

// A5 part 2 (Modernization H1) — downloadable evidence pack (xlsx) + saved
// report presets CRUD. All gated behind report.read; mutations audited.

let app, tokens;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    ReportPreset.deleteMany({}),
    AuditLog.deleteMany({ entity: { $in: ['Report', 'ReportPreset'] } }),
  ]);
});

const get = (token, path) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const post = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).post(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const put = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).put(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const del = async (token, path) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).delete(path).set('Authorization', `Bearer ${token}`).set(csrf);
};

describe('Reports — evidence pack + presets (A5 part 2)', () => {
  test('evidence pack downloads a timestamped xlsx and writes a Report audit line', async () => {
    const res = await get(tokens.admin, '/api/learning/reports/evidence-pack?from=2026-01-01&to=2026-06-30').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('evidence-pack-');
    expect(res.headers['x-tms-record-count']).toBeDefined();
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0); // a real workbook was sent

    const log = await waitForAuditRow({ action: 'exported', entity: 'Report' });
    expect(log).toBeTruthy();
    expect(log.note).toContain('evidence-pack.xlsx');
  });

  test('evidence pack requires report.read (Participant 403)', async () => {
    const res = await get(tokens.leader, '/api/learning/reports/evidence-pack');
    expect(res.status).toBe(403);
  });

  test('preset CRUD is audited and archive soft-deletes', async () => {
    const created = await post(tokens.admin, '/api/learning/reports/presets', {
      name: 'Monthly compliance', kind: 'evidence',
      filters: { from: '2026-01-01', to: '2026-12-31' }, schedule: 'monthly',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Monthly compliance', kind: 'evidence', schedule: 'monthly' });
    const id = created.body.data._id;

    const log = await waitForAuditRow({ entity: 'ReportPreset', action: 'created' });
    expect(log).toMatchObject({ actorRole: 'Admin' });

    expect((await get(tokens.admin, '/api/learning/reports/presets')).body.count).toBe(1);

    const upd = await put(tokens.admin, `/api/learning/reports/presets/${id}`, { schedule: 'quarterly' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.schedule).toBe('quarterly');

    const arch = await del(tokens.admin, `/api/learning/reports/presets/${id}`);
    expect(arch.status).toBe(200);
    expect((await get(tokens.admin, '/api/learning/reports/presets')).body.count).toBe(0);
  });

  test('preset write requires report.read (Participant 403); rejects an empty name', async () => {
    const denied = await post(tokens.leader, '/api/learning/reports/presets', { name: 'X' });
    expect(denied.status).toBe(403);
    const bad = await post(tokens.admin, '/api/learning/reports/presets', { name: '' });
    expect(bad.status).toBe(400);
  });
});
