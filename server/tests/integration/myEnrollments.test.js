const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getSeedData, teardown } = require('../setup');
const Enrollment = require('../../models/Enrollment');

// Rearchitecture Phase 2 — the unified enrollment read. ONE self-scoped surface
// returns a learner's enrollments across BOTH modes: team-based (enrolled via a
// group, teamId set) and cohort-based (enrolled directly, teamId null). Both
// share the Enrollment model; the read tags each row with `mode`.

let app, seed, memberToken;

beforeAll(async () => {
  app = await getApp();
  seed = getSeedData();
  memberToken = jwt.sign({ id: seed.member1._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => { await teardown(); });

afterEach(async () => { await Enrollment.deleteMany({}); });

const getMine = (token) =>
  request(app).get('/api/learning/enrollments/mine').set('Authorization', `Bearer ${token}`);

describe('GET /api/learning/enrollments/mine — unified enrollment read (Phase 2)', () => {
  test('returns an empty list when the learner has no enrollments', async () => {
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('includes a team-based (group) enrollment tagged mode=group', async () => {
    await Enrollment.create({
      userId: seed.member1._id, teamId: seed.team._id, classId: seed.class1._id, status: 'Active',
    });
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const r = res.body.data[0];
    expect(r.mode).toBe('group');
    expect(String(r.cohortId)).toBe(String(seed.class1._id));
    expect(r.cohortCode).toBe('TEST001');
    expect(r.group).toMatchObject({ name: 'Alpha Team' });
    expect(r.status).toBe('Active');
  });

  test('includes a cohort-based (direct) enrollment tagged mode=direct', async () => {
    await Enrollment.create({
      userId: seed.member1._id, teamId: null, classId: seed.class2._id, status: 'Active',
    });
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const r = res.body.data[0];
    expect(r.mode).toBe('direct');
    expect(String(r.cohortId)).toBe(String(seed.class2._id));
    expect(r.group).toBeNull();
  });

  test('merges BOTH modes into one list', async () => {
    await Enrollment.create([
      { userId: seed.member1._id, teamId: seed.team._id, classId: seed.class1._id, status: 'Active' },
      { userId: seed.member1._id, teamId: null, classId: seed.class2._id, status: 'Active' },
    ]);
    const res = await getMine(memberToken);
    expect(res.body.data).toHaveLength(2);
    const modes = res.body.data.map((r) => r.mode).sort();
    expect(modes).toEqual(['direct', 'group']);
  });

  test('is self-scoped — another learner\'s enrollments never leak', async () => {
    await Enrollment.create([
      { userId: seed.member2._id, teamId: seed.team._id, classId: seed.class1._id, status: 'Active' },
      { userId: seed.member2._id, teamId: null, classId: seed.class2._id, status: 'Active' },
    ]);
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]); // member1 owns nothing here
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/learning/enrollments/mine');
    expect(res.status).toBe(401);
  });
});
