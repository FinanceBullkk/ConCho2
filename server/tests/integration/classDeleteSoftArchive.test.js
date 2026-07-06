const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { isPostgres } = require('../../config/db-backend');
const { readActiveRow } = require('../pg-test-utils');
const Class = require('../../models/Class');
const Evaluation = require('../../models/Evaluation');
const Enrollment = require('../../models/Enrollment');

// Industry-audit P1 regression: the legacy DELETE /api/classes/:id used to
// HARD-delete Evaluations + Enrollments (deleteMany), violating the golden rule
// "soft-delete, never hard-delete evaluation data" and diverging from the
// already-correct /api/learning/cohorts path. It now delegates to the domain
// cohort-delete use-case: soft-archive the Class, close enrollments to Dropped,
// PRESERVE evaluations. This test locks that behaviour.

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

describe('Legacy DELETE /api/classes/:id — soft-archive (audit P1)', () => {
  test('soft-archives the class, preserves evaluations, closes enrollments (no hard-delete)', async () => {
    // Fresh class with NO teams/schedules so the referential guards pass.
    const cls = await Class.create({
      classCode: `DEL_TEST_${Date.now()}`,
      courseName: 'Audit Delete Test',
      totalSessions: 1,
      status: 'Ongoing',
    });
    const evalDoc = await Evaluation.create({
      classId: cls._id,
      userId: seed.member1._id,
      grammarScore: 7,
      vocabularyScore: 7,
      pronunciationScore: 7,
      fluencyScore: 7,
      createdBy: seed.teacher._id,
    });
    const enrollDoc = await Enrollment.create({
      userId: seed.member1._id,
      classId: cls._id,
      status: 'Active',
      joinedAt: new Date(),
    });

    const res = await request(app)
      .delete(`/api/classes/${cls._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.cascade.evaluationsPreserved).toBe(true);

    // Class soft-archived (recoverable, not hard-deleted). "Hidden from normal
    // find" is the Mongo soft-delete query hook — assert it only on that backend;
    // the ported delete writes the flag to PG, so read the active row there.
    if (!isPostgres) {
      expect(await Class.findById(cls._id)).toBeNull();
    }
    const archived = await readActiveRow('Class', cls._id);
    expect(archived).not.toBeNull();
    expect(archived.isDeleted).toBe(true);

    // Evaluation PRESERVED — NOT hard-deleted (the golden-rule fix).
    const evalStill = await Evaluation.findById(evalDoc._id).lean();
    expect(evalStill).not.toBeNull();

    // Enrollment closed to 'Dropped' — preserved as history, not hard-deleted.
    // The close-write goes through the ported repo (PG-only on that lane), so
    // read the active backend rather than a Mongoose find.
    const enrollStill = await readActiveRow('Enrollment', enrollDoc._id);
    expect(enrollStill).not.toBeNull();
    expect(enrollStill.status).toBe('Dropped');
  });
});
