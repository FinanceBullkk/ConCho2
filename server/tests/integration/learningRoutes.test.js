const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow, findActiveRowWhere } = require('../pg-test-utils');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const NotificationLog = require('../../models/NotificationLog');

let app, tokens, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await LearningProgram.deleteMany({ code: /^TEST_/ });
  await Class.deleteMany({ classCode: /^LD_TEST_/ });
});

describe('Learning Platform API — programs', () => {
  test('authenticated users can list learning programs', async () => {
    await LearningProgram.create({
      code: 'TEST_ONBOARDING',
      name: 'Onboarding Basics',
      category: 'onboarding',
      defaultSessionCount: 3,
      deliveryMode: 'hybrid',
      schedulingMode: 'admin_scheduled',
    });

    const res = await request(app)
      .get('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.some((p) => p.code === 'TEST_ONBOARDING')).toBe(true);
  });

  test('program list honours ?page/?limit window (PERF-015)', async () => {
    await LearningProgram.create([
      { code: 'TEST_PAGE_A', name: 'Page A', category: 'onboarding', defaultSessionCount: 1, schedulingMode: 'admin_scheduled' },
      { code: 'TEST_PAGE_B', name: 'Page B', category: 'onboarding', defaultSessionCount: 1, schedulingMode: 'admin_scheduled' },
    ]);

    const page1 = await request(app)
      .get('/api/learning/programs?limit=1&page=1&q=Page')
      .set('Authorization', `Bearer ${tokens.admin}`);
    const page2 = await request(app)
      .get('/api/learning/programs?limit=1&page=2&q=Page')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.data).toHaveLength(1);
    expect(page2.body.data).toHaveLength(1);
    // Stable sort (category, name) → distinct rows across the two windows.
    expect(page1.body.data[0]._id).not.toBe(page2.body.data[0]._id);
  });

  test('admin can create a learning program', async () => {
    const res = await request(app)
      .post('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        code: 'test_compliance',
        name: 'Compliance 101',
        category: 'compliance',
        defaultSessionCount: 2,
        deliveryMode: 'online',
        schedulingMode: 'admin_scheduled',
        completionPolicy: {
          attendanceThresholdPercent: 100,
          requiresAssessment: true,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TEST_COMPLIANCE');
    expect(res.body.data.completionPolicy.requiresAssessment).toBe(true);
  });

  test('completion-trend returns an 8-month zero-filled series; participant 403', async () => {
    const created = await request(app)
      .post('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ code: 'trend_prog', name: 'Trend Program', category: 'compliance', defaultSessionCount: 1, deliveryMode: 'online', schedulingMode: 'admin_scheduled' });
    const id = created.body.data._id;

    const res = await request(app)
      .get(`/api/learning/programs/${id}/completion-trend`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(8);
    expect(res.body.data.series[0]).toHaveProperty('month');
    expect(res.body.data.series[0]).toHaveProperty('completions');

    const denied = await request(app)
      .get(`/api/learning/programs/${id}/completion-trend`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(denied.status).toBe(403);
  });

  test('teacher cannot create a learning program', async () => {
    const res = await request(app)
      .post('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        code: 'TEST_TEACHER_BLOCK',
        name: 'Teacher Blocked Program',
        defaultSessionCount: 1,
      });

    expect(res.status).toBe(403);
  });
});

describe('Learning Platform API — cohorts', () => {
  test('admin can create a cohort from a learning program', async () => {
    const program = await LearningProgram.create({
      code: 'TEST_TECHNICAL',
      name: 'Technical Bootcamp',
      category: 'technical',
      defaultSessionCount: 4,
      deliveryMode: 'offline',
      schedulingMode: 'admin_scheduled',
    });

    const res = await request(app)
      .post('/api/learning/cohorts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        cohortCode: 'LD_TEST_001',
        programId: program._id.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.cohortCode).toBe('LD_TEST_001');
    expect(res.body.data.program.code).toBe('TEST_TECHNICAL');
    expect(res.body.data.totalSessions).toBe(4);

    const stored = await findActiveRowWhere('Class', { classCode: 'LD_TEST_001' });
    expect(stored.programId.toString()).toBe(program._id.toString());
    expect(stored.courseName).toBe('Technical Bootcamp');
  });

  test('cohort custom field values round-trip on create + update', async () => {
    const program = await LearningProgram.create({
      code: 'CF_COHORT', name: 'CF Cohort Prog', defaultSessionCount: 2,
    });
    const created = await request(app)
      .post('/api/learning/cohorts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ cohortCode: 'CF_COH_1', programId: program._id.toString(), customFields: { region: 'APAC' } });
    expect(created.status).toBe(201);
    expect(created.body.data.customFields).toMatchObject({ region: 'APAC' });

    const updated = await request(app)
      .put(`/api/learning/cohorts/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ customFields: { region: 'EMEA' } });
    expect(updated.status).toBe(200);
    expect(updated.body.data.customFields).toMatchObject({ region: 'EMEA' });
  });

  test('teacher cannot create a cohort (lacks cohort.manage capability)', async () => {
    const program = await LearningProgram.create({
      code: 'TEST_CAP_BLOCK', name: 'Capability Block', defaultSessionCount: 1,
    });

    const res = await request(app)
      .post('/api/learning/cohorts')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ cohortCode: 'LD_CAP_BLOCK', programId: program._id.toString() });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('legacy class course list is sourced from LearningProgram when catalog exists', async () => {
    await LearningProgram.create({
      code: 'TEST_WORKSHOP',
      name: 'Manager Workshop',
      category: 'workshop',
      defaultSessionCount: 1,
      deliveryMode: 'hybrid',
      schedulingMode: 'self_enroll',
    });

    const res = await request(app)
      .get('/api/classes/courses')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('learning-programs');
    expect(res.body.data.courseSessions['Manager Workshop']).toBe(1);
  });
});

describe('Learning Platform API — cohort edit/delete', () => {
  const mongoose = require('mongoose');
  const Team = require('../../models/Team');
  let cedSeq = 0;

  const seedCohort = async (status = 'Ongoing') => {
    cedSeq += 1;
    const program = await LearningProgram.create({
      code: `TEST_CED_${cedSeq}`, name: `CED Program ${cedSeq}`, defaultSessionCount: 5,
    });
    const cohort = await Class.create({
      classCode: `LD_TEST_CED_${cedSeq}`, courseName: program.name,
      programId: program._id, totalSessions: 5, status,
    });
    return { program, cohort };
  };

  test('admin can update a cohort status + totalSessions', async () => {
    const { cohort } = await seedCohort('Ongoing');
    const res = await request(app)
      .put(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ status: 'Completed', totalSessions: 8 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Completed');
    expect(res.body.data.totalSessions).toBe(8);
    const stored = await readActiveRow('Class', cohort._id);
    expect(stored.status).toBe('Completed');
    expect(stored.totalSessions).toBe(8);
  });

  test('teacher cannot update a cohort (lacks cohort.manage)', async () => {
    const { cohort } = await seedCohort();
    const res = await request(app)
      .put(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`).set(csrf)
      .send({ status: 'Completed' });
    expect(res.status).toBe(403);
  });

  test('updating a non-existent cohort returns 404', async () => {
    const res = await request(app)
      .put(`/api/learning/cohorts/${new mongoose.Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ status: 'Completed' });
    expect(res.status).toBe(404);
  });

  test('admin delete soft-archives the cohort (recoverable, not hard-deleted)', async () => {
    const { cohort } = await seedCohort();
    const res = await request(app)
      .delete(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.cascade).toBeDefined();
    // Soft-archived on the active backend: preserved (recoverable) with
    // isDeleted=true. (A Mongoose findById would read the not-soft-deleted Mongo
    // twin — the ported delete flips is_deleted in PG only.)
    const archived = await readActiveRow('Class', cohort._id);
    expect(archived).not.toBeNull();
    expect(archived.isDeleted).toBe(true);
    expect(archived.deletedAt).toBeTruthy();
  });

  test('archived cohort is excluded from the cohort list, then restore brings it back', async () => {
    const { cohort } = await seedCohort();
    await request(app)
      .delete(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    // Excluded from the normal list ...
    const list = await request(app)
      .get('/api/learning/cohorts')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.body.data.some((c) => c._id === cohort._id.toString())).toBe(false);

    // ... visible in the trash view ...
    const trash = await request(app)
      .get('/api/learning/cohorts/deleted')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(trash.status).toBe(200);
    expect(trash.body.data.some((c) => c._id === cohort._id.toString())).toBe(true);

    // ... and restore returns it to active.
    const restore = await request(app)
      .post(`/api/learning/cohorts/${cohort._id}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    expect(restore.status).toBe(200);
    const back = await Class.findById(cohort._id).lean();
    expect(back).not.toBeNull();
    expect(back.isDeleted).toBe(false);
  });

  test('closing a cohort drops its active enrollments but preserves the records', async () => {
    const Enrollment = require('../../models/Enrollment');
    const { cohort } = await seedCohort();
    const enrollment = await Enrollment.create({
      userId: new mongoose.Types.ObjectId(), classId: cohort._id, status: 'Active',
    });

    await request(app)
      .delete(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    const after = await readActiveRow('Enrollment', enrollment._id);
    expect(after).not.toBeNull();          // preserved (not hard-deleted)
    expect(after.status).toBe('Dropped');  // closed
    await Enrollment.findByIdAndDelete(enrollment._id);
  });

  test('restoring a non-archived / unknown cohort returns 404', async () => {
    const res = await request(app)
      .post(`/api/learning/cohorts/${new mongoose.Types.ObjectId().toString()}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    expect(res.status).toBe(404);
  });

  test('deleting a cohort with an assigned group is blocked (409)', async () => {
    const { cohort } = await seedCohort();
    const team = await Team.create({ name: `CED Team ${cedSeq}`, classId: cohort._id, members: [] });
    const res = await request(app)
      .delete(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(409);
    expect(await Class.findById(cohort._id)).not.toBeNull();
    await Team.findByIdAndDelete(team._id);
  });

  test('teacher cannot delete a cohort (403)', async () => {
    const { cohort } = await seedCohort();
    const res = await request(app)
      .delete(`/api/learning/cohorts/${cohort._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`).set(csrf);
    expect(res.status).toBe(403);
  });
});

describe('Learning Platform API — cohort nudge (S4)', () => {
  let cohortId;

  beforeEach(async () => {
    const program = await LearningProgram.create({
      code: 'TEST_NUDGE', name: 'Nudge Program', defaultSessionCount: 1, schedulingMode: 'admin_scheduled',
    });
    const cohort = await Class.create({
      classCode: 'LD_TEST_NUDGE', courseName: program.name, programId: program._id, totalSessions: 1, status: 'Ongoing',
    });
    cohortId = cohort._id.toString();
  });

  afterEach(async () => {
    await NotificationLog.deleteMany({ type: 'coordinator_nudge' });
  });

  test('admin nudges selected learners → 201 + in-app rows written', async () => {
    const u1 = new mongoose.Types.ObjectId().toString();
    const u2 = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/learning/cohorts/${cohortId}/nudge`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ userIds: [u1, u2], message: 'Please finish your sessions.' });

    expect(res.status).toBe(201);
    expect(res.body.data.notified).toBe(2);
    const rows = await NotificationLog.find({ type: 'coordinator_nudge', recipientUserId: { $in: [u1, u2] } });
    expect(rows).toHaveLength(2);
    expect(rows[0].channel).toBe('in_app');
  });

  test('a same-day re-nudge is idempotent (no duplicate rows)', async () => {
    const u1 = new mongoose.Types.ObjectId().toString();
    const body = { userIds: [u1] };
    await request(app).post(`/api/learning/cohorts/${cohortId}/nudge`).set('Authorization', `Bearer ${tokens.admin}`).set(csrf).send(body);
    await request(app).post(`/api/learning/cohorts/${cohortId}/nudge`).set('Authorization', `Bearer ${tokens.admin}`).set(csrf).send(body);
    const rows = await NotificationLog.find({ type: 'coordinator_nudge', recipientUserId: u1 });
    expect(rows).toHaveLength(1);
  });

  test('a role without enrollment.manage is forbidden (403)', async () => {
    const res = await request(app)
      .post(`/api/learning/cohorts/${cohortId}/nudge`)
      .set('Authorization', `Bearer ${tokens.teacher}`).set(csrf)
      .send({ userIds: [new mongoose.Types.ObjectId().toString()] });
    expect(res.status).toBe(403);
  });

  test('nudging a missing cohort → 404', async () => {
    const res = await request(app)
      .post(`/api/learning/cohorts/${new mongoose.Types.ObjectId().toString()}/nudge`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({ userIds: [new mongoose.Types.ObjectId().toString()] });
    expect(res.status).toBe(404);
  });
});
