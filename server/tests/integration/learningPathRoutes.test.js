const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');
const LearningProgram = require('../../models/LearningProgram');
const LearningPath = require('../../models/LearningPath');
const Class = require('../../models/Class');
const Certificate = require('../../models/Certificate');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    LearningPath.deleteMany({}),
    Certificate.deleteMany({}),
    LearningProgram.deleteMany({}),
    Class.deleteMany({ classCode: /^PTH/ }),
  ]);
});

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

const mkProgram = () =>
  LearningProgram.create({
    code: `PATHP_${uniq()}`, name: `Path Prog ${uniq()}`, schedulingMode: 'self_enroll',
  });

// Mark `userId` as having completed `programId` via an Issued certificate
// (hasCompletedProgram's fast path). Certificate requires a cohort.
const completeProgram = async (userId, programId) => {
  const cohort = await Class.create({
    classCode: `PTH${seq++}`, courseName: 'x', programId, totalSessions: 1,
  });
  return Certificate.create({
    certificateNumber: `CERT-TEST-${uniq()}`, verificationCode: `vc_${uniq()}`,
    userId, programId, cohortId: cohort._id, status: 'Issued',
  });
};

const createPath = (body, token) =>
  request(app)
    .post('/api/learning/paths')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(body);

describe('Learning Platform API — learning paths (Wave C v1)', () => {
  test('an Admin creates a path with ordered programs (201, populated)', async () => {
    const [a, b] = await Promise.all([mkProgram(), mkProgram()]);
    const res = await createPath(
      { code: `LP_${uniq()}`, title: 'Onboarding Path', programs: [a._id, b._id] },
      tokens.admin,
    );
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Onboarding Path');
    expect(res.body.data.programs).toHaveLength(2);
    expect(res.body.data.programs[0]._id).toBe(a._id.toString());
    expect(res.body.data.programs[0].name).toBeDefined(); // populated summary
    expect(res.body.data.status).toBe('active');
  });

  test('a Participant cannot create a path (403 — lacks path.manage)', async () => {
    const res = await createPath({ code: `LP_${uniq()}`, title: 'Nope' }, tokens.leader);
    expect(res.status).toBe(403);
  });

  test('any authenticated learner can list paths (path.read)', async () => {
    await createPath({ code: `LP_${uniq()}`, title: 'Visible' }, tokens.admin);
    const res = await request(app)
      .get('/api/learning/paths')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  test('creating with a non-existent program is rejected (422)', async () => {
    const res = await createPath(
      { code: `LP_${uniq()}`, title: 'Bad', programs: ['64b000000000000000000000'] },
      tokens.admin,
    );
    expect(res.status).toBe(422);
  });

  test('duplicate path code is rejected (409)', async () => {
    const code = `LP_${uniq()}`;
    await createPath({ code, title: 'First' }, tokens.admin);
    const res = await createPath({ code, title: 'Second' }, tokens.admin);
    expect(res.status).toBe(409);
  });

  test('an Admin updates title + reorders programs (200)', async () => {
    const [a, b] = await Promise.all([mkProgram(), mkProgram()]);
    const created = await createPath(
      { code: `LP_${uniq()}`, title: 'Old', programs: [a._id, b._id] },
      tokens.admin,
    );
    const res = await request(app)
      .put(`/api/learning/paths/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ title: 'New', programs: [b._id, a._id] });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
    expect(res.body.data.programs[0]._id).toBe(b._id.toString());
  });

  test('progress: with no completions the first step is current, the rest locked', async () => {
    const [a, b] = await Promise.all([mkProgram(), mkProgram()]);
    const created = await createPath(
      { code: `LP_${uniq()}`, title: 'Progress', programs: [a._id, b._id] },
      tokens.admin,
    );
    const res = await request(app)
      .get(`/api/learning/paths/${created.body.data._id}/progress`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(200);
    expect(res.body.data.steps[0].status).toBe('current');
    expect(res.body.data.steps[1].status).toBe('locked');
    expect(res.body.data.summary).toMatchObject({ total: 2, completed: 0, percentComplete: 0, complete: false });
  });

  test('progress: completing the first program advances the current step', async () => {
    const [a, b] = await Promise.all([mkProgram(), mkProgram()]);
    const created = await createPath(
      { code: `LP_${uniq()}`, title: 'Progress2', programs: [a._id, b._id] },
      tokens.admin,
    );
    await completeProgram(seed.leader._id, a._id);

    const res = await request(app)
      .get(`/api/learning/paths/${created.body.data._id}/progress`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(200);
    expect(res.body.data.steps[0].status).toBe('completed');
    expect(res.body.data.steps[1].status).toBe('current');
    expect(res.body.data.summary).toMatchObject({ total: 2, completed: 1, percentComplete: 50, complete: false });
  });

  test('archiving (DELETE) soft-deletes the path — it then 404s and leaves the list', async () => {
    const created = await createPath({ code: `LP_${uniq()}`, title: 'Doomed' }, tokens.admin);
    const id = created.body.data._id;

    const del = await request(app)
      .delete(`/api/learning/paths/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe('archived');

    const get = await request(app)
      .get(`/api/learning/paths/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(get.status).toBe(404);

    // soft-deleted, not hard-deleted — the row is still recoverable in storage
    // (read the active backend: the row lives in PG on the pg lane).
    expect(await readActiveRow('LearningPath', id)).not.toBeNull();
  });
});
