/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — assessment/question-bank-repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Question-bank item CRUD. Runs only when a Postgres URL is present; SKIPS
 * otherwise. Asserts identical behaviour + traps:
 *   • options/correctOptionIndexes/acceptedAnswers default undefined → OMITTED
 *     when unset (not []); tags defaults to []
 *   • list filters (type/tag/programId) + prompt regex (case-insensitive) + sort
 *   • soft-delete excluded on reads/update; softDelete has no is_deleted guard
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/assessment/question-bank-repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const P1 = hex(1211);
const Q1 = hex(1221); const Q2 = hex(1222); const Q3 = hex(1223); const QD = hex(1224);

const qProj = (x) => {
  const o = norm(x);
  return o == null ? null : {
    type: o.type, prompt: o.prompt, options: o.options, correctOptionIndexes: o.correctOptionIndexes,
    acceptedAnswers: o.acceptedAnswers, points: o.points, explanation: o.explanation, tags: o.tags,
    programId: o.programId ? String(o.programId) : null,
  };
};

describePg('PG-parity: assessment/question-bank-repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('AssessmentQuestion')).insertMany([
      { _id: oid(Q1), type: 'single_choice', prompt: 'Two plus two', options: ['3', '4', '5'], correctOptionIndexes: [1], points: 2, explanation: 'math', tags: ['math'], programId: oid(P1), cohortId: null, createdBy: null, isDeleted: false, updatedAt: day(1) },
      { _id: oid(Q2), type: 'multiple_choice', prompt: 'Pick primes', options: ['2', '3', '4'], correctOptionIndexes: [0, 1], points: 1, explanation: '', tags: ['math', 'hard'], programId: null, cohortId: null, createdBy: null, isDeleted: false, updatedAt: day(2) },
      { _id: oid(Q3), type: 'short_text', prompt: 'Capital of France', acceptedAnswers: ['paris'], points: 3, explanation: '', tags: [], programId: null, cohortId: null, createdBy: null, isDeleted: false, updatedAt: day(3) },
      { _id: oid(QD), type: 'short_text', prompt: 'Gone', acceptedAnswers: ['x'], points: 1, tags: [], isDeleted: true, updatedAt: day(4) },
    ]);

    await query('TRUNCATE assessment_questions');
    const ins = (id, type, prompt, opts, correct, accepted, points, expl, tags, prog, d, del = false) => query(
      `INSERT INTO assessment_questions(id,type,prompt,options,correct_option_indexes,accepted_answers,points,explanation,tags,program_id,is_deleted,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, type, prompt, opts, correct, accepted, points, expl, tags, prog, del, day(d).toISOString()]);
    await ins(Q1, 'single_choice', 'Two plus two', ['3', '4', '5'], [1], null, 2, 'math', ['math'], P1, 1);
    await ins(Q2, 'multiple_choice', 'Pick primes', ['2', '3', '4'], [0, 1], null, 1, '', ['math', 'hard'], null, 2);
    await ins(Q3, 'short_text', 'Capital of France', null, null, ['paris'], 3, '', [], null, 3);
    await ins(QD, 'short_text', 'Gone', null, null, ['x'], 1, '', [], null, 4, true);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('listQuestions: sort updatedAt desc + soft-delete excluded + filters — identical', async () => {
    const [m, p] = await both((r) => r.listQuestions({}));
    expect(m.map((x) => x.prompt)).toEqual(['Capital of France', 'Pick primes', 'Two plus two']); // day3,2,1; QD out
    expect(p.map(qProj)).toEqual(m.map(qProj));

    const [mT, pT] = await both((r) => r.listQuestions({ tag: 'hard' }));
    expect(mT.map((x) => x.prompt)).toEqual(['Pick primes']);
    expect(pT.map(qProj)).toEqual(mT.map(qProj));

    const [mTy, pTy] = await both((r) => r.listQuestions({ type: 'single_choice' }));
    expect(mTy.map((x) => x.prompt)).toEqual(['Two plus two']);
    expect(pTy.map(qProj)).toEqual(mTy.map(qProj));

    const [mP, pP] = await both((r) => r.listQuestions({ programId: P1 }));
    expect(mP.map(qProj)).toEqual(pP.map(qProj));

    const [mQ, pQ] = await both((r) => r.listQuestions({ q: 'pLuS' })); // case-insensitive regex
    expect(mQ.map((x) => x.prompt)).toEqual(['Two plus two']);
    expect(pQ.map(qProj)).toEqual(mQ.map(qProj));
  });

  test('findQuestionById: omits unset arrays (short_text) + deleted hidden — identical', async () => {
    const [m1, p1] = await both((r) => r.findQuestionById(Q1)); // single_choice → options + correctOptionIndexes
    expect(qProj(m1)).toEqual({ type: 'single_choice', prompt: 'Two plus two', options: ['3', '4', '5'], correctOptionIndexes: [1], acceptedAnswers: undefined, points: 2, explanation: 'math', tags: ['math'], programId: P1 });
    expect(qProj(p1)).toEqual(qProj(m1));

    const [m3, p3] = await both((r) => r.findQuestionById(Q3)); // short_text → NO options/correctOptionIndexes keys
    expect(norm(m3).options).toBeUndefined();
    expect(norm(m3).correctOptionIndexes).toBeUndefined();
    expect(qProj(m3)).toEqual({ type: 'short_text', prompt: 'Capital of France', options: undefined, correctOptionIndexes: undefined, acceptedAnswers: ['paris'], points: 3, explanation: '', tags: [], programId: null });
    expect(qProj(p3)).toEqual(qProj(m3));

    expect(await repo.impls.mongo.findQuestionById(QD)).toBeNull();
    expect(await repo.impls.pg.findQuestionById(QD)).toBeNull();
  });

  test('createQuestion: short_text omits options; single_choice carries them — identical', async () => {
    const [mS, pS] = await both((r) => r.createQuestion({ type: 'short_text', prompt: 'Who?', acceptedAnswers: ['neo'], tags: [] }));
    expect(qProj(mS)).toEqual({ type: 'short_text', prompt: 'Who?', options: undefined, correctOptionIndexes: undefined, acceptedAnswers: ['neo'], points: 1, explanation: '', tags: [], programId: null });
    expect(qProj(pS)).toEqual(qProj(mS));

    const [mC, pC] = await both((r) => r.createQuestion({ type: 'single_choice', prompt: 'Pick', options: ['a', 'b'], correctOptionIndexes: [0], tags: ['t'] }));
    expect(qProj(mC)).toMatchObject({ options: ['a', 'b'], correctOptionIndexes: [0], points: 1, tags: ['t'] });
    expect(qProj(pC)).toEqual(qProj(mC));
  });

  test('updateQuestion + softDeleteQuestion (no is_deleted guard) — identical', async () => {
    const [mU, pU] = await both((r) => r.updateQuestion(Q1, { points: 5, tags: ['math', 'updated'] }));
    expect(qProj(mU)).toMatchObject({ points: 5, tags: ['math', 'updated'] });
    expect(qProj(pU)).toEqual(qProj(mU));

    const [mD, pD] = await both((r) => r.softDeleteQuestion(Q2));
    expect(norm(mD).isDeleted).toBe(true); expect(norm(pD).isDeleted).toBe(true);
    expect(await repo.impls.mongo.findQuestionById(Q2)).toBeNull();
    expect(await repo.impls.pg.findQuestionById(Q2)).toBeNull();
  });
});
