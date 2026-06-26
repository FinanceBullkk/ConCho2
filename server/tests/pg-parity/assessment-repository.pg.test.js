/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/assessment repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The 18-method assessment-engine surface: assessment definitions + attempts +
 * question-bank lookup + unified-results/grading-queue reads. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Pins the trap-prone behaviours:
 *   • items/answers jsonb with Mongoose subdoc defaults (item points→1, _id gen;
 *     answer pointsEarned/correct/manualNote/manualGradedBy/At defaults; absent
 *     default:undefined fields stay absent);
 *   • populate cohortId/userId/assessmentId/classId (deleted ref → null);
 *   • grading-queue items.type=short_text containment; createdAt/submittedAt desc;
 *   • findCohortModeClassIds (cohort-mode programs' classes); listGradableClasses
 *     include/exclude + binary classCode sort; count aggregations (is_deleted).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/assessment/repository'); // registers most models
require('../../models/User'); // populate('userId') target — not required by the repo chain

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const aid = (r, mId, pId) => (r === repo.impls.pg ? pId : mId);
const sortStr = (a) => [...a].map(String).sort();

const PCO = hex(0xC01); const PTEAM = hex(0xC02);
const C1 = hex(0xC11); const C2 = hex(0xC12); const C3 = hex(0xC13); const CDEL = hex(0xC14);
const U1 = hex(0xC21); const U2 = hex(0xC22); const GRADER = hex(0xC23);
const Q1 = hex(0xC31); const QDEL = hex(0xC32);
const EV1 = hex(0xC41); const EV2 = hex(0xC42); const EVDEL = hex(0xC43); const EV3 = hex(0xC44);
const IT1 = hex(0xC51); const IT2 = hex(0xC52); // answer itemIds (fixed)
const TS = (s) => `2026-05-${s}T03:00:00.000Z`;

const ITEMS = [
  { type: 'single_choice', prompt: 'Q-A', options: ['x', 'y'], correctOptionIndexes: [0], points: 2 },
  { type: 'short_text', prompt: 'Q-B', acceptedAnswers: ['hi'] }, // points omitted → default 1
];
const ITEMS_NOTEXT = [{ type: 'single_choice', prompt: 'Q-C', options: ['a', 'b'], correctOptionIndexes: [1], points: 3 }];
const ANSWERS = [
  { itemId: IT1, selectedOptionIndexes: [0], pointsEarned: 2, pointsPossible: 2, correct: true },
  { itemId: IT2, text: 'hi', pointsEarned: 1, pointsPossible: 1, correct: true },
];

describePg('PG-parity: domains/assessment repository', () => {
  let mem;
  const id = {};

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    // ── Mongo seed (cohorts / users / questions / evaluations) ──
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(PCO), code: 'PCO', name: 'Cohort Prog', status: 'active', schedulingMode: 'self_enroll' },
      { _id: oid(PTEAM), code: 'PTEAM', name: 'Team Prog', status: 'active', schedulingMode: 'leader_booking' },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'Course1', programId: oid(PCO), status: 'Ongoing', isDeleted: false },
      { _id: oid(C2), classCode: 'C-2', courseName: 'Course2', programId: oid(PTEAM), status: 'Ongoing', isDeleted: false },
      { _id: oid(C3), classCode: 'C-3', courseName: 'Course3', status: 'Ongoing', isDeleted: false },
      { _id: oid(CDEL), classCode: 'C-D', courseName: 'CourseD', status: 'Ongoing', isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'E1', name: 'Alice', department: 'Eng', isDeleted: false },
      { _id: oid(U2), empCode: 'E2', name: 'Bob', department: 'Eng', isDeleted: false },
      { _id: oid(GRADER), empCode: 'G1', name: 'Grader', department: 'Eng', isDeleted: false },
    ]);
    await db.collection(coll('AssessmentQuestion')).insertMany([
      { _id: oid(Q1), type: 'short_text', prompt: 'Bank Q', points: 1, isDeleted: false },
      { _id: oid(QDEL), type: 'short_text', prompt: 'Deleted Q', points: 1, isDeleted: true },
    ]);
    await db.collection(coll('Evaluation')).insertMany([
      { _id: oid(EV1), classId: oid(C2), userId: oid(U1), isDeleted: false, updatedAt: new Date(TS('15')) },
      { _id: oid(EV2), classId: oid(C2), userId: oid(U2), isDeleted: false, updatedAt: new Date(TS('14')) },
      { _id: oid(EVDEL), classId: oid(C3), userId: oid(U2), isDeleted: true, updatedAt: new Date(TS('13')) },
      { _id: oid(EV3), classId: oid(C3), userId: oid(U1), isDeleted: false, updatedAt: new Date(TS('10')) },
    ]);

    // ── PG seed ──
    await query('TRUNCATE learning_programs, classes, users, assessment_questions, evaluations, assessments, assessment_attempts');
    await query(
      `INSERT INTO learning_programs(id,code,name,status,scheduling_mode) VALUES
        ($1,'PCO','Cohort Prog','active','self_enroll'),($2,'PTEAM','Team Prog','active','leader_booking')`, [PCO, PTEAM]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,program_id,status,is_deleted) VALUES
        ($1,'C-1','Course1',$5,'Ongoing',false),($2,'C-2','Course2',$6,'Ongoing',false),
        ($3,'C-3','Course3',NULL,'Ongoing',false),($4,'C-D','CourseD',NULL,'Ongoing',true)`,
      [C1, C2, C3, CDEL, PCO, PTEAM]);
    await query(
      `INSERT INTO users(id,emp_code,name,department,is_deleted) VALUES
        ($1,'E1','Alice','Eng',false),($2,'E2','Bob','Eng',false),($3,'G1','Grader','Eng',false)`, [U1, U2, GRADER]);
    await query(
      `INSERT INTO assessment_questions(id,type,prompt,points,is_deleted) VALUES
        ($1,'short_text','Bank Q',1,false),($2,'short_text','Deleted Q',1,true)`, [Q1, QDEL]);
    await query(
      `INSERT INTO evaluations(id,class_id,user_id,is_deleted,updated_at) VALUES
        ($1,$5,$7,false,$9),($2,$5,$8,false,$10),($3,$6,$8,true,$11),($4,$6,$7,false,$12)`,
      [EV1, EV2, EVDEL, EV3, C2, C3, U1, U2, TS('15'), TS('14'), TS('13'), TS('10')]);

    // ── Assessments via BOTH repos (unit under test) ──
    const mk = (cohort, items, published, by) => (r) => r.createAssessment({
      title: `T-${cohort}-${published ? 'pub' : 'draft'}`, cohortId: cohort, programId: null,
      items, isPublished: published, passingScorePercent: 50, maxAttempts: 2, createdBy: by,
    });
    const [mA1, pA1] = await both(mk(C1, ITEMS, true, GRADER));
    const [mA2, pA2] = await both(mk(C2, ITEMS_NOTEXT, true, GRADER));
    const [mA3, pA3] = await both(mk(C1, ITEMS, false, GRADER)); // unpublished, has short_text
    id.m_A1 = mA1._id; id.p_A1 = pA1._id; id.m_A2 = mA2._id; id.p_A2 = pA2._id; id.m_A3 = mA3._id; id.p_A3 = pA3._id;

    // ── Attempts via BOTH repos ──
    const att = (assess, user, passed) => (r) => r.createAttempt({
      assessmentId: aid(r, assess.m, assess.p), userId: user, cohortId: C1,
      answers: ANSWERS, score: 3, maxScore: 3, scorePercent: 100, passed,
    });
    const [mT1, pT1] = await both(att({ m: id.m_A1, p: id.p_A1 }, U1, true));
    const [mT2, pT2] = await both(att({ m: id.m_A1, p: id.p_A1 }, U2, false));
    id.m_T1 = mT1._id; id.p_T1 = pT1._id; id.m_T2 = mT2._id; id.p_T2 = pT2._id;
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const projItem = (it) => ({ type: it.type, prompt: it.prompt, points: it.points, opts: it.options || null, correct: it.correctOptionIndexes || null, accepted: it.acceptedAnswers || null });
  const projA = (a) => { const n = norm(a); return n == null ? null : {
    title: n.title, published: n.isPublished, passing: n.passingScorePercent, maxAttempts: n.maxAttempts,
    cohort: n.cohortId && typeof n.cohortId === 'object' ? n.cohortId.classCode : (n.cohortId ? String(n.cohortId) : null),
    items: (n.items || []).map(projItem),
  }; };
  const projAt = (a) => { const n = norm(a); return n == null ? null : {
    user: n.userId && typeof n.userId === 'object' ? n.userId.empCode : String(n.userId),
    assess: n.assessmentId && typeof n.assessmentId === 'object' ? n.assessmentId.title : (n.assessmentId ? 'raw' : null),
    score: n.score, passed: n.passed, answers: n.answers,
  }; };

  test('findCohort: shape; deleted → null', async () => {
    const [m, p] = await both((r) => r.findCohort(C1));
    expect(norm(m)).toMatchObject({ classCode: 'C-1', programId: PCO });
    expect(norm(p)).toMatchObject({ classCode: 'C-1', programId: PCO });
    const [md, pd] = await both((r) => r.findCohort(CDEL));
    expect(md).toBeNull(); expect(pd).toBeNull();
  });

  test('createAssessment + findAssessmentById: item defaults + _id generated', async () => {
    const [m, p] = await both((r) => r.findAssessmentById(aid(r, id.m_A1, id.p_A1)));
    expect(projA(m)).toEqual({
      title: 'T-' + C1 + '-pub', published: true, passing: 50, maxAttempts: 2, cohort: C1,
      items: [
        { type: 'single_choice', prompt: 'Q-A', points: 2, opts: ['x', 'y'], correct: [0], accepted: null },
        { type: 'short_text', prompt: 'Q-B', points: 1, opts: null, correct: null, accepted: ['hi'] }, // points default 1
      ],
    });
    expect(projA(p)).toEqual(projA(m));
    // each item carries a generated _id on both backends
    expect(norm(p).items.every((it) => typeof it._id === 'string' && it._id.length > 0)).toBe(true);
  });

  test('updateAssessment: replace fields', async () => {
    const [m, p] = await both((r) => r.updateAssessment(aid(r, id.m_A3, id.p_A3), {
      title: 'T-updated', isPublished: true, passingScorePercent: 70,
    }));
    expect(norm(m)).toMatchObject({ title: 'T-updated', isPublished: true, passingScorePercent: 70 });
    expect(norm(p)).toMatchObject({ title: 'T-updated', isPublished: true, passingScorePercent: 70 });
  });

  test('listAssessments: cohort filter + populate + createdAt desc', async () => {
    const [m, p] = await both((r) => r.listAssessments({ cohortId: C1 }));
    // A1 + A3 both cohort C1; A3 now published (prev test). cohort populated.
    expect(sortStr(norm(m).map((a) => a.title))).toEqual(sortStr(norm(p).map((a) => a.title)));
    expect(norm(m).every((a) => a.cohortId.classCode === 'C-1')).toBe(true);
    expect(norm(p).every((a) => a.cohortId.classCode === 'C-1')).toBe(true);
    const [mp, pp] = await both((r) => r.listAssessments({ publishedOnly: true, cohortIds: [C1, C2] }));
    expect(sortStr(norm(mp).map((a) => a.title))).toEqual(sortStr(norm(pp).map((a) => a.title)));
  });

  test('countAttempts + createAttempt + findAttemptById: answer defaults', async () => {
    const [mc, pc] = await both((r) => r.countAttempts(aid(r, id.m_A1, id.p_A1), U1));
    expect(mc).toBe(1); expect(pc).toBe(1);
    const [m, p] = await both((r) => r.findAttemptById(aid(r, id.m_T1, id.p_T1)));
    expect(projAt(m)).toEqual({ user: U1, assess: 'raw', score: 3, passed: true, answers: norm(m).answers });
    // answers normalized identically (manualNote '', manualGradedBy/At null added)
    expect(norm(p).answers).toEqual(norm(m).answers);
    expect(norm(m).answers[0]).toMatchObject({ itemId: IT1, pointsEarned: 2, correct: true, manualNote: '', manualGradedBy: null, manualGradedAt: null });
  });

  test('listAttempts: populate user+assessment + submittedAt desc', async () => {
    const [m, p] = await both((r) => r.listAttempts({ assessmentId: aid(r, id.m_A1, id.p_A1) }));
    expect(norm(m).map((a) => a.userId.empCode).sort()).toEqual(['E1', 'E2']);
    expect(norm(p).map((a) => a.userId.empCode).sort()).toEqual(['E1', 'E2']);
    expect(norm(m).every((a) => a.assessmentId.title === 'T-' + C1 + '-pub')).toBe(true);
    expect(norm(p).every((a) => a.assessmentId.title === 'T-' + C1 + '-pub')).toBe(true);
  });

  test('updateAttemptGrade: $set + populate', async () => {
    const regraded = [{ itemId: IT1, pointsEarned: 0, pointsPossible: 2, correct: false }];
    const [m, p] = await both((r) => r.updateAttemptGrade(aid(r, id.m_T2, id.p_T2), {
      answers: regraded, score: 0, maxScore: 2, scorePercent: 0, passed: false,
    }));
    expect(projAt(m)).toEqual({ user: 'E2', assess: 'T-' + C1 + '-pub', score: 0, passed: false, answers: norm(m).answers });
    expect(projAt(p)).toEqual(projAt(m));
  });

  test('findQuestionBankItemsByIds: soft-delete filtered', async () => {
    const [m, p] = await both((r) => r.findQuestionBankItemsByIds([Q1, QDEL]));
    expect(norm(m).map((q) => q.prompt)).toEqual(['Bank Q']); // QDEL excluded
    expect(norm(p).map((q) => q.prompt)).toEqual(['Bank Q']);
  });

  test('listEvaluationsForLearner: populate classId + updatedAt desc + soft-delete', async () => {
    const proj = (rows) => norm(rows).map((e) => ({ class: e.classId ? e.classId.classCode : null }));
    const [m, p] = await both((r) => r.listEvaluationsForLearner(U1));
    expect(proj(m)).toEqual([{ class: 'C-2' }, { class: 'C-3' }]); // EV1(05-15) then EV3(05-10)
    expect(proj(p)).toEqual(proj(m));
  });

  test('listShortTextAssessments: items containment + published + cohort scope', async () => {
    const [m, p] = await both((r) => r.listShortTextAssessments(null));
    // only A1 (published + has short_text); A3 unpublished originally but updated to published in updateAssessment test
    const mt = sortStr(norm(m).map((a) => a.title));
    expect(sortStr(norm(p).map((a) => a.title))).toEqual(mt);
    expect(mt).toContain('T-' + C1 + '-pub');
    // A2 (no short_text) excluded
    expect(mt).not.toContain('T-' + C2 + '-pub');
    const [ms, ps] = await both((r) => r.listShortTextAssessments([C2]));
    expect(norm(ms).length).toBe(0); expect(norm(ps).length).toBe(0); // no short_text assessment in C2
  });

  test('countAttemptsByAssessment + countEvaluationsByClass aggregations', async () => {
    const [m, p] = await both((r) => r.countAttemptsByAssessment([aid(r, id.m_A1, id.p_A1)]));
    expect(norm(m)[0].count).toBe(2); expect(norm(p)[0].count).toBe(2);
    const ev = (rows) => Object.fromEntries(norm(rows).map((x) => [String(x._id), x.count]));
    // aggregate() does NOT cast hex→ObjectId (prod passes ObjectIds from listGradableClasses).
    const cid = (r, h) => (r === repo.impls.pg ? h : oid(h));
    const [me, pe] = await both((r) => r.countEvaluationsByClass([cid(r, C2), cid(r, C3)]));
    expect(ev(me)).toEqual({ [C2]: 2, [C3]: 1 }); // EVDEL excluded
    expect(ev(pe)).toEqual(ev(me));
  });

  test('findCohortModeClassIds + listGradableClasses', async () => {
    const [m, p] = await both((r) => r.findCohortModeClassIds());
    expect(sortStr(m)).toEqual([C1]); // only C1 (program PCO = self_enroll)
    expect(sortStr(p)).toEqual([C1]);
    const codes = (rows) => norm(rows).map((c) => c.classCode);
    const [ma, pa] = await both((r) => r.listGradableClasses({}));
    expect(codes(ma)).toEqual(['C-1', 'C-2', 'C-3']); // live, classCode asc; CDEL excluded
    expect(codes(pa)).toEqual(['C-1', 'C-2', 'C-3']);
    const [mx, px] = await both((r) => r.listGradableClasses({ excludeIds: [C1] }));
    expect(codes(mx)).toEqual(['C-2', 'C-3']);
    expect(codes(px)).toEqual(['C-2', 'C-3']);
    const [mi, pi] = await both((r) => r.listGradableClasses({ includeIds: [C3, C2] }));
    expect(codes(mi)).toEqual(['C-2', 'C-3']); // sorted, not input order
    expect(codes(pi)).toEqual(['C-2', 'C-3']);
  });

  test('softDeleteAssessment: hides assessment', async () => {
    const [m, p] = await both((r) => r.softDeleteAssessment(aid(r, id.m_A2, id.p_A2)));
    expect(norm(m).isDeleted).toBe(true); expect(norm(p).isDeleted).toBe(true);
    const [mg, pg] = await both((r) => r.findAssessmentById(aid(r, id.m_A2, id.p_A2)));
    expect(mg).toBeNull(); expect(pg).toBeNull();
  });
});
