const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Setting = require('../../models/Setting');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Enrollment = require('../../models/Enrollment');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  await Setting.findOneAndUpdate(
    { key: 'ALLOWED_TIME_SLOTS' },
    { $addToSet: { value: { sh: 10, sm: 0, eh: 11, em: 0 } } },
  );
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Schedule.deleteMany({});
  await Enrollment.deleteMany({});
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { teacherIds: [], programId: null } },
  );
  await LearningProgram.deleteMany({});
});

const vnSlot = (offsetDays = 0) => {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToNextMonday + offsetDays);
  d.setUTCHours(3, 0, 0, 0);
  const start = new Date(d);
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  return { start, end };
};

describe('Learning Platform API — sessions', () => {
  test('leader can book a session with group vocabulary', async () => {
    const { start, end } = vnSlot();

    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        groupId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBeTruthy();
    expect(res.body.data.scheduleId).toBeTruthy();
    expect(res.body.data.cohort.cohortCode).toBe('TEST001');
    expect(res.body.data.group.name).toBe('Alpha Team');
    expect(res.body.data.enrolledLearners).toHaveLength(3);
    expect(res.body.data.enrolledUsers).toBeUndefined();

    const stored = await Schedule.findById(res.body.data.scheduleId).lean();
    expect(stored.bookedTeamId.toString()).toBe(seed.team._id.toString());
  });

  test('list sessions maps Schedule records to session DTOs', async () => {
    const { start, end } = vnSlot();
    const second = vnSlot(1);
    await Schedule.create([
      {
        classId: seed.class1._id, bookedTeamId: seed.team._id,
        startTime: start, endTime: end,
        enrolledUsers: [seed.leader._id, seed.member1._id],
      },
      {
        classId: seed.class1._id, bookedTeamId: seed.team._id,
        startTime: second.start, endTime: second.end,
        enrolledUsers: [seed.member2._id],
      },
    ]);

    const res = await request(app)
      .get(`/api/learning/sessions?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(2);
    expect(res.body.data[0].cohortId).toBe(seed.class1._id.toString());
    expect(res.body.data[0].groupId).toBe(seed.team._id.toString());
    expect(res.body.data[0].enrolledLearnerCount).toBe(2);
    expect(res.body.data.map((s) => s.sessionNumber)).toEqual([1, 2]);
  });

  test('participant list is scoped to enrolled sessions', async () => {
    const { start, end } = vnSlot();
    const second = vnSlot(1);
    await Schedule.create([
      {
        classId: seed.class1._id, bookedTeamId: seed.team._id,
        startTime: start, endTime: end,
        enrolledUsers: [seed.leader._id],
      },
      {
        classId: seed.class1._id, bookedTeamId: seed.team._id,
        startTime: second.start, endTime: second.end,
        enrolledUsers: [seed.member1._id],
      },
    ]);

    const res = await request(app)
      .get('/api/learning/sessions')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].enrolledLearners[0]._id).toBe(seed.leader._id.toString());
  });

  test('teacher reads are scoped to assigned cohorts', async () => {
    const { start, end } = vnSlot();
    const second = vnSlot(1);
    await Class.findByIdAndUpdate(seed.class1._id, {
      $addToSet: { teacherIds: seed.teacher._id },
    });
    const [assigned, unassigned] = await Schedule.create([
      {
        classId: seed.class1._id, bookedTeamId: seed.team._id,
        startTime: start, endTime: end,
        enrolledUsers: [seed.member1._id],
      },
      {
        classId: seed.class2._id, bookedTeamId: seed.team._id,
        startTime: second.start, endTime: second.end,
        enrolledUsers: [seed.member2._id],
      },
    ]);

    const list = await request(app)
      .get('/api/learning/sessions')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].scheduleId).toBe(assigned._id.toString());

    await request(app)
      .get(`/api/learning/sessions/${unassigned._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .expect(403);
  });

  test('participant cannot fetch a session they are not enrolled in', async () => {
    const { start, end } = vnSlot();
    const schedule = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end,
      enrolledUsers: [seed.member1._id],
    });

    const res = await request(app)
      .get(`/api/learning/sessions/${schedule._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
  });

  test('teacher cannot book or cancel through session adapter', async () => {
    const { start, end } = vnSlot();
    const next = vnSlot(1);
    const schedule = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: seed.team._id,
      startTime: start, endTime: end,
      enrolledUsers: [seed.leader._id],
    });

    await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        groupId: seed.team._id.toString(),
        startTime: next.start.toISOString(),
        endTime: next.end.toISOString(),
      })
      .expect(403);

    await request(app)
      .delete(`/api/learning/sessions/${schedule._id}/cancel`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .expect(403);
  });

  test('leader_booking program is enforced and still books', async () => {
    const program = await LearningProgram.create({
      code: 'LB001', name: 'Leader Booking Program', schedulingMode: 'leader_booking',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        groupId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('admin_scheduled program: Admin can create a session', async () => {
    const program = await LearningProgram.create({
      code: 'AS001', name: 'Admin Scheduled Program', schedulingMode: 'admin_scheduled',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        groupId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.scheduleId).toBeTruthy();
  });

  test('admin_scheduled program: a team leader is rejected with 403', async () => {
    const program = await LearningProgram.create({
      code: 'AS002', name: 'Admin Scheduled Program 2', schedulingMode: 'admin_scheduled',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        groupId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/admin-scheduled/i);
  });

  test('self_enroll program: booking against a GROUP is rejected (use the cohort)', async () => {
    const program = await LearningProgram.create({
      code: 'SE001', name: 'Self Enroll Program', schedulingMode: 'self_enroll',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        groupId: seed.team._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/cohort-based/i);
  });

  test('self_enroll program: Admin schedules a cohort session enrolling its active learners', async () => {
    const program = await LearningProgram.create({
      code: 'SE002', name: 'Self Enroll Program 2', schedulingMode: 'self_enroll',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
    await Enrollment.create([
      { userId: seed.member1._id, classId: seed.class1._id, teamId: null, status: 'Active' },
      { userId: seed.member2._id, classId: seed.class1._id, teamId: null, status: 'Active' },
      // A dropped enrollment must NOT be carried onto the session.
      { userId: seed.leader._id, classId: seed.class1._id, teamId: null, status: 'Dropped' },
    ]);

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        cohortId: seed.class1._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cohortId).toBe(seed.class1._id.toString());
    expect(res.body.data.groupId).toBeNull();
    expect(res.body.data.enrolledLearnerCount).toBe(2);

    const stored = await Schedule.findById(res.body.data.scheduleId).lean();
    expect(stored.bookedTeamId).toBeNull();
    expect(stored.enrolledUsers).toHaveLength(2);
  });

  test('nomination program: Admin schedules a cohort session', async () => {
    const program = await LearningProgram.create({
      code: 'NM001', name: 'Nomination Program', schedulingMode: 'nomination',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
    await Enrollment.create([
      { userId: seed.member1._id, classId: seed.class1._id, teamId: null, status: 'Active' },
    ]);

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        cohortId: seed.class1._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enrolledLearnerCount).toBe(1);
  });

  test('cohort booking by a non-admin (leader) is rejected with 403', async () => {
    const program = await LearningProgram.create({
      code: 'SE003', name: 'Self Enroll Program 3', schedulingMode: 'self_enroll',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        cohortId: seed.class1._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('cohort booking against a team-based (leader_booking) cohort is rejected with 400', async () => {
    const program = await LearningProgram.create({
      code: 'LB900', name: 'Leader Booking Program', schedulingMode: 'leader_booking',
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });

    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        cohortId: seed.class1._id.toString(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/self_enroll\/nomination/);
  });

  test('booking with neither groupId nor cohortId fails validation (400)', async () => {
    const { start, end } = vnSlot();
    const res = await request(app)
      .post('/api/learning/sessions/book-slot')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ startTime: start.toISOString(), endTime: end.toISOString() });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
