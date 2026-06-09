const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Enrollment = require('../../models/Enrollment');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const { runReconciliation } = require('../../services/reconcileService');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  await Enrollment.init(); // build partial unique indexes before the race test
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Enrollment.deleteMany({});
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { programId: null } },
  );
  await LearningProgram.deleteMany({});
});

const enroll = (token, body) =>
  request(app)
    .post('/api/learning/enrollments')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(body);

describe('Learning Platform API — cohort enrollments', () => {
  test('admin enrolls a learner into a cohort and it shows in the list', async () => {
    const res = await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(),
      userId: seed.member1._id.toString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cohortId).toBe(seed.class1._id.toString());
    expect(res.body.data.status).toBe('Active');

    const list = await request(app)
      .get(`/api/learning/enrollments?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.data[0].learner.id).toBe(seed.member1._id.toString());
  });

  test('duplicate active cohort enrollment is rejected with 409', async () => {
    await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(),
    });
    const dup = await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(),
    });
    expect(dup.status).toBe(409);
  });

  test('concurrent duplicate enroll → exactly one Active, the loser gets 409 (race-safe)', async () => {
    const body = { cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString() };
    const [a, b] = await Promise.all([enroll(tokens.admin, body), enroll(tokens.admin, body)]);

    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);

    const active = await Enrollment.countDocuments({
      userId: seed.member1._id, classId: seed.class1._id, teamId: null, status: 'Active',
    });
    expect(active).toBe(1);
  });

  test('self-enroll only allowed when program schedulingMode is self_enroll', async () => {
    // class1 has no program -> self-enroll forbidden
    const blocked = await enroll(tokens.leader, { cohortId: seed.class1._id.toString() });
    expect(blocked.status).toBe(403);

    // link a self_enroll program -> learner may enroll themselves
    const program = await LearningProgram.create({
      code: 'SE100', name: 'Self Enroll Cohort Program', schedulingMode: 'self_enroll',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const ok = await enroll(tokens.leader, { cohortId: seed.class1._id.toString() });
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('Active');

    const list = await request(app)
      .get(`/api/learning/enrollments?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.body.data.some((e) => e.learner.id === seed.leader._id.toString())).toBe(true);
  });

  test('a non-admin cannot enroll a different learner even in a self_enroll program', async () => {
    const program = await LearningProgram.create({
      code: 'SE101', name: 'Self Enroll Program 2', schedulingMode: 'self_enroll',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const res = await enroll(tokens.leader, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(),
    });
    expect(res.status).toBe(403);
  });

  test('cohort enrollment is rejected (422) once program maxParticipants is reached', async () => {
    const program = await LearningProgram.create({
      code: 'CAP200', name: 'Capped Cohort Program', schedulingMode: 'self_enroll',
      capacityPolicy: { maxParticipants: 1 },
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    // First enrollment fills the cohort (cap 1).
    const first = await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(),
    });
    expect(first.status).toBe(201);

    // Second exceeds maxParticipants → 422 (applies to Admin too).
    const second = await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member2._id.toString(),
    });
    expect(second.status).toBe(422);
    expect(second.body.message).toMatch(/đầy|full|capacity/i);

    const active = await Enrollment.countDocuments({
      classId: seed.class1._id, teamId: null, status: 'Active',
    });
    expect(active).toBe(1);
  });

  test('withdraw soft-drops the enrollment (record kept, status Dropped)', async () => {
    const created = await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(),
    });
    const id = created.body.data.id;

    const del = await request(app)
      .delete(`/api/learning/enrollments/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe('Dropped');

    const stored = await Enrollment.findById(id).lean();
    expect(stored).toBeTruthy();
    expect(stored.status).toBe('Dropped');
    expect(stored.leftAt).toBeTruthy();
  });

  test('reconcile does not flag a cohort enrollment (teamId null) as orphaned', async () => {
    await enroll(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(),
    });
    const enr = await Enrollment.findOne({ classId: seed.class1._id, teamId: null }).lean();

    const report = await runReconciliation('manual');
    const flaggedAsOrphan = (report.issues || []).some(
      (i) => i.check === 'orphaned_enrollment'
        && String(i.refs?.enrollmentId) === String(enr._id),
    );
    expect(flaggedAsOrphan).toBe(false);
  });
});
