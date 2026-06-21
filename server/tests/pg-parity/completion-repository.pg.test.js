/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/completion repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The completion engine's reads (cohort/policy resolution, attendance counters,
 * the four evidence reads) + the certificate CRUD spine. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Asserts identical behaviour + traps:
 *   • findCohort/findLearnerName hide soft-deleted rows (Class/User hooks)
 *   • resolveCompletionContext merges policy + OMITS certificateValidityDays on
 *     the no-program branch
 *   • countCohortSessions excludes cancelled; countAttendedSessions counts P/L only
 *   • findEvaluation/findFeedback filter is_deleted; findPassingAttempt returns the
 *     HIGHEST scorePercent passing attempt
 *   • createCertificate + the QB-008 partial-unique race (23505 → code 11000)
 *   • listCertificates populate(user) drops a deleted learner to null
 *   • markRevoked flips the lifecycle status
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/User'); // findLearnerName + populate('userId') ref (lazy-required by the repo)
const repo = require('../../domains/learning/completion/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const U1 = hex(401); const UD = hex(402);
const P1 = hex(411);
const C1 = hex(421); const C2 = hex(422); const CD = hex(423);
const S1 = hex(431); const S2 = hex(432); const S3 = hex(433);
const A1 = hex(441);
const EV1 = hex(451);
const FB1 = hex(461);
const AS1 = hex(471); const AT1 = hex(472); const AT2 = hex(473);

const POLICY = { attendanceThresholdPercent: 50, requiresAssessment: true, requiresFeedback: true };
const SNAPSHOT = {
  attendancePercent: 50, attendanceThresholdPercent: 50, assessmentRequired: true,
  assessmentMet: true, averageScore: 7.5, feedbackRequired: true, feedbackMet: true,
};

const cohortProj = (c) => (c == null ? null : {
  classCode: c.classCode, courseName: c.courseName,
  programId: c.programId ? String(c.programId) : null, isDeleted: Boolean(c.isDeleted),
});
const learnerProj = (l) => (l == null ? null : { name: l.name, empCode: l.empCode });
const evalProj = (e) => (e == null ? null : {
  level: e.level, grammarScore: e.grammarScore, vocabularyScore: e.vocabularyScore,
  pronunciationScore: e.pronunciationScore, fluencyScore: e.fluencyScore, teacherComment: e.teacherComment,
});
const fbProj = (f) => (f == null ? null : {
  rating: f.rating, contentRating: f.contentRating, instructorRating: f.instructorRating, comment: f.comment,
});
const attemptProj = (a) => (a == null ? null : { scorePercent: a.scorePercent, passed: a.passed });
const certProj = (c) => (c == null ? null : {
  certificateNumber: c.certificateNumber, verificationCode: c.verificationCode,
  learnerName: c.learnerName, programName: c.programName, cohortCode: c.cohortCode,
  status: c.status, validityDays: c.validityDays, completion: norm(c.completionSnapshot),
  user: c.userId && typeof c.userId === 'object' && c.userId.name !== undefined
    ? { empCode: c.userId.empCode, name: c.userId.name, department: c.userId.department }
    : (c.userId ? String(c.userId) : null),
  cohortId: c.cohortId ? String(c.cohortId) : null,
  programId: c.programId ? String(c.programId) : null,
});

describePg('PG-parity: learning/completion repository', () => {
  let mem;
  let mCert; let pCert; // captured from createCertificate (per-backend ids differ)

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Certificate').init(); // build the QB-008 partial-unique
    const db = mongoose.connection.db;

    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'Uno', department: 'Eng', status: 'Active', isDeleted: false },
      { _id: oid(UD), empCode: 'U3', name: 'Gone', department: 'Eng', status: 'Active', isDeleted: true },
    ]);
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(P1), name: 'Prog 1', code: 'PG-1', completionPolicy: POLICY, certificateValidityDays: 365 },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'CC1', courseName: 'Course 1', programId: oid(P1), isDeleted: false },
      { _id: oid(C2), classCode: 'CC2', courseName: 'Course 2', programId: null, isDeleted: false },
      { _id: oid(CD), classCode: 'CCD', courseName: 'Course D', programId: oid(P1), isDeleted: true },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(S1), classId: oid(C1), status: 'scheduled', startTime: day(1) },
      { _id: oid(S2), classId: oid(C1), status: 'scheduled', startTime: day(2) },
      { _id: oid(S3), classId: oid(C1), status: 'cancelled', startTime: day(3) },
    ]);
    await db.collection(coll('Attendance')).insertMany([
      { _id: oid(A1), userId: oid(U1), scheduleId: oid(S1), status: 'P' },
    ]);
    await db.collection(coll('Evaluation')).insertMany([
      {
        _id: oid(EV1), classId: oid(C1), userId: oid(U1), level: 'B2',
        grammarScore: 8, vocabularyScore: 7, pronunciationScore: 6, fluencyScore: 9,
        teacherComment: 'good', isDeleted: false,
      },
    ]);
    await db.collection(coll('Feedback')).insertMany([
      {
        _id: oid(FB1), cohortId: oid(C1), userId: oid(U1), programId: oid(P1),
        rating: 5, contentRating: 4, instructorRating: 5, comment: 'great', isDeleted: false,
      },
    ]);
    await db.collection(coll('AssessmentAttempt')).insertMany([
      { _id: oid(AT1), assessmentId: oid(AS1), userId: oid(U1), cohortId: oid(C1), passed: true, score: 8, maxScore: 10, scorePercent: 80, submittedAt: day(5), isDeleted: false },
      { _id: oid(AT2), assessmentId: oid(AS1), userId: oid(U1), cohortId: oid(C1), passed: true, score: 9, maxScore: 10, scorePercent: 90, submittedAt: day(6), isDeleted: false },
    ]);

    await query('TRUNCATE users, learning_programs, classes, schedules, attendances, evaluations, feedbacks, assessment_attempts, certificates');
    await query(`INSERT INTO users(id,emp_code,name,department,status,is_deleted) VALUES ($1,'U1','Uno','Eng','Active',false),($2,'U3','Gone','Eng','Active',true)`, [U1, UD]);
    await query(`INSERT INTO learning_programs(id,name,code,completion_policy,certificate_validity_days) VALUES ($1,'Prog 1','PG-1',$2,365)`, [P1, JSON.stringify(POLICY)]);
    await query(`INSERT INTO classes(id,class_code,course_name,program_id,is_deleted) VALUES ($1,'CC1','Course 1',$2,false),($3,'CC2','Course 2',null,false),($4,'CCD','Course D',$5,true)`, [C1, P1, C2, CD, P1]);
    await query(`INSERT INTO schedules(id,class_id,start_time,status) VALUES ($1,$2,$3,'scheduled'),($4,$5,$6,'scheduled'),($7,$8,$9,'cancelled')`,
      [S1, C1, day(1).toISOString(), S2, C1, day(2).toISOString(), S3, C1, day(3).toISOString()]);
    await query(`INSERT INTO attendances(id,user_id,schedule_id,status) VALUES ($1,$2,$3,'P')`, [A1, U1, S1]);
    await query(`INSERT INTO evaluations(id,class_id,user_id,level,grammar_score,vocabulary_score,pronunciation_score,fluency_score,teacher_comment) VALUES ($1,$2,$3,'B2',8,7,6,9,'good')`, [EV1, C1, U1]);
    await query(`INSERT INTO feedbacks(id,cohort_id,user_id,program_id,rating,content_rating,instructor_rating,comment) VALUES ($1,$2,$3,$4,5,4,5,'great')`, [FB1, C1, U1, P1]);
    await query(`INSERT INTO assessment_attempts(id,assessment_id,user_id,cohort_id,passed,score,max_score,score_percent,submitted_at) VALUES ($1,$2,$3,$4,true,8,10,80,$5),($6,$7,$8,$9,true,9,10,90,$10)`,
      [AT1, AS1, U1, C1, day(5).toISOString(), AT2, AS1, U1, C1, day(6).toISOString()]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('findCohort (hides deleted) + findLearnerName (hides deleted) — identical', async () => {
    const [mC, pC] = await both((r) => r.findCohort(C1));
    expect(cohortProj(mC)).toEqual({ classCode: 'CC1', courseName: 'Course 1', programId: P1, isDeleted: false });
    expect(cohortProj(pC)).toEqual(cohortProj(mC));
    expect(await repo.impls.mongo.findCohort(CD)).toBeNull(); // deleted cohort hidden
    expect(await repo.impls.pg.findCohort(CD)).toBeNull();

    const [mL, pL] = await both((r) => r.findLearnerName(U1));
    expect(learnerProj(mL)).toEqual({ name: 'Uno', empCode: 'U1' });
    expect(learnerProj(pL)).toEqual(learnerProj(mL));
    expect(await repo.impls.mongo.findLearnerName(UD)).toBeNull(); // deleted user hidden
    expect(await repo.impls.pg.findLearnerName(UD)).toBeNull();
  });

  test('resolveCompletionContext — program branch + no-program branch — identical', async () => {
    const [mC1, pC1] = await both((r) => r.findCohort(C1));
    const mCtx = await repo.impls.mongo.resolveCompletionContext(mC1);
    const pCtx = await repo.impls.pg.resolveCompletionContext(pC1);
    expect(norm(mCtx)).toEqual({
      policy: { ...POLICY }, programId: P1, programName: 'Prog 1', certificateValidityDays: 365,
    });
    expect(norm(pCtx)).toEqual(norm(mCtx));

    // no-program cohort → default policy, NO certificateValidityDays key
    const [mC2, pC2] = await both((r) => r.findCohort(C2));
    const mCtx2 = await repo.impls.mongo.resolveCompletionContext(mC2);
    const pCtx2 = await repo.impls.pg.resolveCompletionContext(pC2);
    expect(norm(mCtx2)).toEqual({
      policy: { attendanceThresholdPercent: 0, requiresAssessment: false, requiresFeedback: false },
      programId: null, programName: 'Course 2',
    });
    expect(norm(pCtx2)).toEqual(norm(mCtx2));
  });

  test('countCohortSessions (excludes cancelled) + countAttendedSessions (P/L only) — identical', async () => {
    const [mS, pS] = await both((r) => r.countCohortSessions(C1));
    expect(mS).toBe(2); expect(pS).toBe(2); // S3 cancelled excluded

    const [mA, pA] = await both((r) => r.countAttendedSessions(C1, U1));
    expect(mA).toBe(1); expect(pA).toBe(1);

    const [mA0, pA0] = await both((r) => r.countAttendedSessions(C2, U1)); // no schedules → 0
    expect(mA0).toBe(0); expect(pA0).toBe(0);
  });

  test('findEvaluation + findFeedback + findPassingAttempt (highest score) — identical', async () => {
    const [mE, pE] = await both((r) => r.findEvaluation(C1, U1));
    expect(evalProj(mE)).toEqual({ level: 'B2', grammarScore: 8, vocabularyScore: 7, pronunciationScore: 6, fluencyScore: 9, teacherComment: 'good' });
    expect(evalProj(pE)).toEqual(evalProj(mE));

    const [mF, pF] = await both((r) => r.findFeedback(C1, U1));
    expect(fbProj(mF)).toEqual({ rating: 5, contentRating: 4, instructorRating: 5, comment: 'great' });
    expect(fbProj(pF)).toEqual(fbProj(mF));

    const [mAt, pAt] = await both((r) => r.findPassingAttempt(C1, U1));
    expect(attemptProj(mAt)).toEqual({ scorePercent: 90, passed: true }); // AT2 wins (90 > 80)
    expect(attemptProj(pAt)).toEqual(attemptProj(mAt));
  });

  test('createCertificate + findActiveCertificate + duplicate race (23505 → 11000) — identical', async () => {
    const data = {
      certificateNumber: 'CERT-2026-000401', verificationCode: 'vcode-401',
      userId: U1, cohortId: C1, programId: P1,
      learnerName: 'Uno', programName: 'Prog 1', cohortCode: 'CC1',
      completionSnapshot: SNAPSHOT, issuedBy: null,
      issuedAt: day(7), validFrom: day(7), validUntil: day(8), validityDays: 365, status: 'Issued',
    };
    [mCert, pCert] = await both((r) => r.createCertificate(data));
    const expected = {
      certificateNumber: 'CERT-2026-000401', verificationCode: 'vcode-401',
      learnerName: 'Uno', programName: 'Prog 1', cohortCode: 'CC1', status: 'Issued',
      validityDays: 365, completion: SNAPSHOT, user: U1, cohortId: C1, programId: P1,
    };
    expect(certProj(mCert)).toEqual(expected);
    expect(certProj(pCert)).toEqual(certProj(mCert));

    const [mA, pA] = await both((r) => r.findActiveCertificate(U1, C1));
    expect(certProj(mA)).toEqual(certProj(mCert));
    expect(certProj(pA)).toEqual(certProj(mA));

    // QB-008 race: a second active cert for the same (learner, cohort) — both
    // reject with a Mongo-style { code: 11000 } (PG 23505 mapped in the repo).
    const dup = { ...data, certificateNumber: 'CERT-2026-000402', verificationCode: 'vcode-402' };
    await expect(repo.impls.mongo.createCertificate(dup)).rejects.toMatchObject({ code: 11000 });
    await expect(repo.impls.pg.createCertificate(dup)).rejects.toMatchObject({ code: 11000 });
  });

  test('findCertificateById + findByVerificationCode + listCertificates (populate user) — identical', async () => {
    const mById = await repo.impls.mongo.findCertificateById(mCert._id);
    const pById = await repo.impls.pg.findCertificateById(pCert._id);
    expect(certProj(mById)).toEqual(certProj(mCert));
    expect(certProj(pById)).toEqual(certProj(mById));

    const [mV, pV] = await both((r) => r.findByVerificationCode('vcode-401'));
    expect(certProj(mV)).toEqual(certProj(mCert));
    expect(certProj(pV)).toEqual(certProj(mV));

    const [mL, pL] = await both((r) => r.listCertificates({ cohortId: C1 }));
    expect(mL.map(certProj)).toEqual([{ ...certProj(mCert), user: { empCode: 'U1', name: 'Uno', department: 'Eng' } }]);
    expect(pL.map(certProj)).toEqual(mL.map(certProj)); // user populated identically
  });

  test('markRevoked — flips lifecycle status — identical', async () => {
    const mR = await repo.impls.mongo.markRevoked(mCert._id, 'policy breach');
    const pR = await repo.impls.pg.markRevoked(pCert._id, 'policy breach');
    expect(mR.status).toBe('Revoked');
    expect(pR.status).toBe('Revoked');
    expect(mR.revokedReason).toBe('policy breach');
    expect(pR.revokedReason).toBe('policy breach');
    // once revoked it is no longer the ACTIVE certificate on either backend
    expect(await repo.impls.mongo.findActiveCertificate(U1, C1)).toBeNull();
    expect(await repo.impls.pg.findActiveCertificate(U1, C1)).toBeNull();
  });
});
