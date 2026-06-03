const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Feedback = require('../../models/Feedback');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

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
    Schedule.deleteMany({}),
    Feedback.deleteMany({}),
    LearningProgram.deleteMany({}),
  ]);
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { programId: null } },
  );
});

// Put `user` on a session roster for class1 → makes them a cohort participant.
// Each call needs a distinct startTime (UNIQUE {classId, startTime} index).
let rosterSlot = 0;
const seedRoster = (userId) => {
  const base = new Date('2026-02-02T03:00:00Z').getTime();
  const startTime = new Date(base + rosterSlot++ * 86400000);
  return Schedule.create({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime,
    endTime: new Date(startTime.getTime() + 3600000),
    enrolledUsers: [userId],
  });
};

const linkProgram = async (completionPolicy) => {
  const program = await LearningProgram.create({
    code: `FBK_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: 'Feedback Program',
    completionPolicy,
  });
  await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
  return program;
};

const submit = (token, body) =>
  request(app)
    .post('/api/learning/feedback')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(body);

// The seed exposes a leader (Participant) token; mint a member1 token directly.
const member1Token = () =>
  jwt.sign({ id: seed.member1._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('Learning Platform API — cohort feedback', () => {
  test('a participant on the cohort roster can submit feedback (201)', async () => {
    await seedRoster(seed.leader._id);
    const res = await submit(tokens.leader, {
      cohortId: seed.class1._id.toString(),
      rating: 5,
      contentRating: 4,
      comment: 'Great cohort',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.rating).toBe(5);
    expect(res.body.data.contentRating).toBe(4);
    expect(res.body.data.learner.id).toBe(seed.leader._id.toString());
  });

  test('re-submitting updates the existing feedback (200, no duplicate)', async () => {
    await seedRoster(seed.leader._id);
    await submit(tokens.leader, { cohortId: seed.class1._id.toString(), rating: 3 });
    const res = await submit(tokens.leader, { cohortId: seed.class1._id.toString(), rating: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.rating).toBe(5);
    const count = await Feedback.countDocuments({ cohortId: seed.class1._id, userId: seed.leader._id });
    expect(count).toBe(1);
  });

  test('a non-participant cannot submit feedback (403)', async () => {
    // class2 has no roster/enrollment for the leader.
    const res = await submit(tokens.leader, { cohortId: seed.class2._id.toString(), rating: 4 });
    expect(res.status).toBe(403);
  });

  test('a participant cannot submit feedback for another learner (403)', async () => {
    await seedRoster(seed.leader._id);
    const res = await submit(tokens.leader, {
      cohortId: seed.class1._id.toString(),
      userId: seed.member1._id.toString(),
      rating: 4,
    });
    expect(res.status).toBe(403);
  });

  test('an admin may submit feedback on a learner\'s behalf', async () => {
    await seedRoster(seed.member1._id);
    const res = await submit(tokens.admin, {
      cohortId: seed.class1._id.toString(),
      userId: seed.member1._id.toString(),
      rating: 4,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.learner.id).toBe(seed.member1._id.toString());
  });

  test('a teacher cannot submit feedback (lacks feedback.submit) but can list', async () => {
    await seedRoster(seed.leader._id);
    await submit(tokens.leader, { cohortId: seed.class1._id.toString(), rating: 5 });

    const blocked = await submit(tokens.teacher, { cohortId: seed.class1._id.toString(), rating: 1 });
    expect(blocked.status).toBe(403);

    const list = await request(app)
      .get(`/api/learning/feedback?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
  });

  test('a participant only sees their own feedback in the list', async () => {
    await seedRoster(seed.leader._id);
    await seedRoster(seed.member1._id);
    await submit(tokens.leader, { cohortId: seed.class1._id.toString(), rating: 5 });
    await submit(tokens.admin, {
      cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString(), rating: 2,
    });

    const list = await request(app)
      .get(`/api/learning/feedback?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${member1Token()}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.data[0].learner.id).toBe(seed.member1._id.toString());
  });

  test('requiresFeedback now blocks completion until feedback is submitted', async () => {
    await linkProgram({ attendanceThresholdPercent: 0, requiresFeedback: true });
    await seedRoster(seed.leader._id);

    const before = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(before.body.data.feedback.required).toBe(true);
    expect(before.body.data.feedback.met).toBe(false);
    expect(before.body.data.feedback.submitted).toBe(false);
    expect(before.body.data.feedback.reason).toBe('feedback-not-submitted');
    expect(before.body.data.complete).toBe(false);

    await submit(tokens.leader, { cohortId: seed.class1._id.toString(), rating: 5 });

    const after = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(after.body.data.feedback.met).toBe(true);
    expect(after.body.data.feedback.submitted).toBe(true);
    expect(after.body.data.complete).toBe(true);
  });
});
