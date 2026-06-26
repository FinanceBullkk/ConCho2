const crypto = require('crypto');
const { query } = require('../../config/pg');
const { COHORT_SCHEDULING_MODES } = require('../_shared/scheduling-modes');

// ──────────────────────────────────────────────────────────
// assessment/repository — POSTGRES impl (Phase 3 Wave-B dual-backend port).
// Assessment definitions (assessments, migration 026) + attempts
// (assessment_attempts, 011) + question-bank items (assessment_questions, 021)
// + the unified-results / grading-queue reads. Same interface as
// ./repository.mongo; ./repository resolves by DB_BACKEND.
//
// Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • items/answers are jsonb. createAssessment/createAttempt apply the SAME
//     subdoc defaults Mongoose would (item _id generated; points default 1;
//     answer pointsEarned/pointsPossible/correct/manualNote/manualGradedBy/
//     manualGradedAt defaults; default:undefined fields stay ABSENT) so the
//     stored/returned blob matches a Mongo .toObject().
//   • soft-delete predicates explicit (Assessment/Attempt have no Mongo hooks;
//     softDelete = findByIdAndUpdate with no is_deleted guard). Class/Evaluation
//     find+aggregate HOOKS → is_deleted=false even where the source omits it.
//   • populate('cohortId'/'userId'/'assessmentId'/'classId') → a 2nd query / the
//     embed; deleted cohort still embeds (Class.findById in the source has no
//     guard on the populate path — but populate runs Class.find → hook filters →
//     deleted → null), so cohort populate LEFT-JOINs is_deleted=false.
//   • grading-queue: `items.type=short_text` → `items @> '[{"type":"short_text"}]'`.
//   • listGradableClasses {classCode:1} sort = Mongo binary order (JS cmp).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const idOrNull = (v) => (v == null ? null : String(v));
const cmp = (x, y) => ((x || '') < (y || '') ? -1 : (x || '') > (y || '') ? 1 : 0); // Mongo binary order

// item subdoc → mirror Mongoose itemSchema defaults (+ generate _id on create).
const normItem = (it) => {
  const o = { _id: it._id ? String(it._id) : newId(), type: it.type, prompt: it.prompt };
  if (it.options !== undefined) o.options = it.options;
  if (it.correctOptionIndexes !== undefined) o.correctOptionIndexes = it.correctOptionIndexes;
  if (it.acceptedAnswers !== undefined) o.acceptedAnswers = it.acceptedAnswers;
  o.questionBankItemId = it.questionBankItemId == null ? null : String(it.questionBankItemId);
  o.points = it.points == null ? 1 : it.points;
  return o;
};

// answer subdoc → mirror Mongoose answerSchema defaults (_id:false). default:undefined
// fields (selectedOptionIndexes/text/manualPointsEarned/manualCorrect) stay ABSENT.
const normAnswer = (a) => {
  const o = { itemId: a.itemId == null ? null : String(a.itemId) };
  if (a.selectedOptionIndexes !== undefined) o.selectedOptionIndexes = a.selectedOptionIndexes;
  if (a.text !== undefined) o.text = a.text;
  o.pointsEarned = a.pointsEarned == null ? 0 : a.pointsEarned;
  o.pointsPossible = a.pointsPossible == null ? 0 : a.pointsPossible;
  o.correct = a.correct == null ? false : a.correct;
  if (a.manualPointsEarned !== undefined) o.manualPointsEarned = a.manualPointsEarned;
  if (a.manualCorrect !== undefined) o.manualCorrect = a.manualCorrect;
  o.manualNote = a.manualNote == null ? '' : a.manualNote;
  o.manualGradedBy = a.manualGradedBy == null ? null : String(a.manualGradedBy);
  o.manualGradedAt = a.manualGradedAt == null ? null : a.manualGradedAt;
  return o;
};

// ── Row → shape mappers ───────────────────────────────────
// cohortArg: undefined = raw id (findAssessmentById/create/update); else the
// populated {_id,classCode,courseName} (or null) for the list reads.
const assessmentRow = (r, ...cohortArg) => {
  if (r == null) return null;
  return {
    _id: r.id, title: r.title, description: r.description == null ? '' : r.description,
    cohortId: cohortArg.length ? cohortArg[0] : (r.cohort_id || null),
    programId: r.program_id || null,
    items: r.items || [],
    passingScorePercent: Number(r.passing_score_percent),
    maxAttempts: Number(r.max_attempts),
    timeLimitMinutes: Number(r.time_limit_minutes),
    shuffleQuestions: r.shuffle_questions,
    showAnswersAfter: r.show_answers_after,
    isPublished: r.is_published,
    createdBy: r.created_by || null,
    isDeleted: r.is_deleted, deletedAt: r.deleted_at || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
};

const attemptRow = (r, embeds = {}) => {
  if (r == null) return null;
  return {
    _id: r.id, assessmentId: 'assessmentId' in embeds ? embeds.assessmentId : (r.assessment_id || null),
    userId: 'userId' in embeds ? embeds.userId : (r.user_id || null),
    cohortId: r.cohort_id || null,
    answers: r.answers || [],
    score: Number(r.score), maxScore: Number(r.max_score), scorePercent: Number(r.score_percent),
    passed: r.passed, submittedAt: r.submitted_at,
    isDeleted: r.is_deleted, deletedAt: r.deleted_at || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
};

const qRow = (r) => {
  const o = {
    _id: r.id, type: r.type, prompt: r.prompt, points: Number(r.points),
    explanation: r.explanation || '', tags: (r.tags || []).map(String),
    programId: r.program_id || null, cohortId: r.cohort_id || null, createdBy: r.created_by || null,
    isDeleted: r.is_deleted, deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
  if (r.options != null) o.options = (r.options || []).map(String);
  if (r.correct_option_indexes != null) o.correctOptionIndexes = (r.correct_option_indexes || []).map(Number);
  if (r.accepted_answers != null) o.acceptedAnswers = (r.accepted_answers || []).map(String);
  return o;
};

const cohortSummary = async (cohortId) => {
  if (!cohortId) return null;
  // populate('cohortId') runs Class.find → soft-delete hook → deleted → null.
  const { rows } = await query(
    `SELECT id, class_code, course_name FROM classes WHERE id = $1 AND is_deleted = false`, [String(cohortId)]);
  return rows[0] ? { _id: rows[0].id, classCode: rows[0].class_code, courseName: rows[0].course_name } : null;
};

const findCohort = async (cohortId) => {
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, teacher_ids, is_deleted
       FROM classes WHERE id = $1 AND is_deleted = false`, [String(cohortId)]);
  const c = rows[0];
  return c ? {
    _id: c.id, classCode: c.class_code, courseName: c.course_name,
    programId: c.program_id || null, teacherIds: (c.teacher_ids || []).map(String), isDeleted: c.is_deleted,
  } : null;
};

// ── Assessments ───────────────────────────────────────────
const ASSESS_COL = {
  title: 'title', description: 'description', cohortId: 'cohort_id', programId: 'program_id',
  items: 'items', passingScorePercent: 'passing_score_percent', maxAttempts: 'max_attempts',
  timeLimitMinutes: 'time_limit_minutes', shuffleQuestions: 'shuffle_questions',
  showAnswersAfter: 'show_answers_after', isPublished: 'is_published', createdBy: 'created_by',
};
const assessVal = (k, v) => {
  if (k === 'items') return JSON.stringify((v || []).map(normItem));
  if (k === 'cohortId' || k === 'programId' || k === 'createdBy') return idOrNull(v);
  return v;
};

const createAssessment = async (data) => {
  const { rows } = await query(
    `INSERT INTO assessments
       (id, title, description, cohort_id, program_id, items, passing_score_percent, max_attempts,
        time_limit_minutes, shuffle_questions, show_answers_after, is_published, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      newId(), data.title, data.description == null ? '' : data.description,
      idOrNull(data.cohortId), idOrNull(data.programId),
      JSON.stringify((data.items || []).map(normItem)),
      data.passingScorePercent == null ? 0 : data.passingScorePercent,
      data.maxAttempts == null ? 0 : data.maxAttempts,
      data.timeLimitMinutes == null ? 0 : data.timeLimitMinutes,
      data.shuffleQuestions == null ? false : data.shuffleQuestions,
      data.showAnswersAfter == null ? false : data.showAnswersAfter,
      data.isPublished == null ? false : data.isPublished,
      idOrNull(data.createdBy),
    ]);
  return assessmentRow(rows[0]);
};

const findAssessmentById = async (id) => {
  const { rows } = await query(`SELECT * FROM assessments WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? assessmentRow(rows[0]) : null;
};

const updateAssessment = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(ASSESS_COL)) {
    if (Object.prototype.hasOwnProperty.call(data, k)) { args.push(assessVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findAssessmentById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE assessments SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? assessmentRow(rows[0]) : null;
};

const listAssessments = async ({ cohortId, cohortIds, publishedOnly }) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (cohortId) { args.push(String(cohortId)); conds.push(`cohort_id = $${args.length}`); }
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`cohort_id = ANY($${args.length})`); }
  if (publishedOnly) conds.push('is_published = true');
  const { rows } = await query(
    `SELECT * FROM assessments WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`, args);
  return Promise.all(rows.map(async (r) => assessmentRow(r, await cohortSummary(r.cohort_id))));
};

const softDeleteAssessment = async (id) => {
  // findByIdAndUpdate has NO is_deleted guard in Mongo → none here.
  const { rows } = await query(
    `UPDATE assessments SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
    [String(id)]);
  return rows[0] ? assessmentRow(rows[0]) : null;
};

// ── Attempts ──────────────────────────────────────────────
const countAttempts = async (assessmentId, userId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM assessment_attempts
      WHERE assessment_id = $1 AND user_id = $2 AND is_deleted = false`, [String(assessmentId), String(userId)]);
  return rows[0].n;
};

const createAttempt = async (data) => {
  const { rows } = await query(
    `INSERT INTO assessment_attempts
       (id, assessment_id, user_id, cohort_id, answers, score, max_score, score_percent, passed, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      newId(), idOrNull(data.assessmentId), idOrNull(data.userId), idOrNull(data.cohortId),
      JSON.stringify((data.answers || []).map(normAnswer)),
      data.score == null ? 0 : data.score, data.maxScore == null ? 0 : data.maxScore,
      data.scorePercent == null ? 0 : data.scorePercent, data.passed == null ? false : data.passed,
      (data.submittedAt ? new Date(data.submittedAt) : new Date()).toISOString(),
    ]);
  return attemptRow(rows[0]);
};

const userSummary = async (userId) => {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT id, emp_code, name, department FROM users WHERE id = $1 AND is_deleted = false`, [String(userId)]);
  return rows[0] ? { _id: rows[0].id, empCode: rows[0].emp_code, name: rows[0].name, department: rows[0].department } : null;
};

const assessmentTitle = async (assessmentId) => {
  if (!assessmentId) return null;
  // populate('assessmentId','title') runs Assessment.find → no soft-delete hook on
  // Assessment (model has plain isDeleted field, no pre-hook) → embeds regardless.
  const { rows } = await query(`SELECT id, title FROM assessments WHERE id = $1`, [String(assessmentId)]);
  return rows[0] ? { _id: rows[0].id, title: rows[0].title } : null;
};

const embedAttempt = async (r) => attemptRow(r, {
  userId: await userSummary(r.user_id),
  assessmentId: await assessmentTitle(r.assessment_id),
});

const listAttempts = async ({ cohortId, cohortIds, assessmentId, learnerId }) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (cohortId) { args.push(String(cohortId)); conds.push(`cohort_id = $${args.length}`); }
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`cohort_id = ANY($${args.length})`); }
  if (assessmentId) { args.push(String(assessmentId)); conds.push(`assessment_id = $${args.length}`); }
  if (learnerId) { args.push(String(learnerId)); conds.push(`user_id = $${args.length}`); }
  const { rows } = await query(
    `SELECT * FROM assessment_attempts WHERE ${conds.join(' AND ')} ORDER BY submitted_at DESC`, args);
  return Promise.all(rows.map(embedAttempt));
};

const findAttemptById = async (id) => {
  const { rows } = await query(`SELECT * FROM assessment_attempts WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? attemptRow(rows[0]) : null;
};

const ATTEMPT_COL = { answers: 'answers', score: 'score', maxScore: 'max_score', scorePercent: 'score_percent', passed: 'passed' };
const updateAttemptGrade = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(ATTEMPT_COL)) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      args.push(k === 'answers' ? JSON.stringify((data[k] || []).map(normAnswer)) : data[k]);
      sets.push(`${col} = $${args.length}`);
    }
  }
  if (!sets.length) {
    const { rows } = await query(`SELECT * FROM assessment_attempts WHERE id = $1 AND is_deleted = false`, [String(id)]);
    return rows[0] ? embedAttempt(rows[0]) : null;
  }
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE assessment_attempts SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? embedAttempt(rows[0]) : null;
};

const findQuestionBankItemsByIds = async (qids) => {
  const list = (qids || []).map(String);
  if (!list.length) return [];
  const { rows } = await query(
    `SELECT * FROM assessment_questions WHERE id = ANY($1) AND is_deleted = false`, [list]);
  return rows.map(qRow);
};

// ── Unified results / grading queue ───────────────────────
const listEvaluationsForLearner = async (userId) => {
  // Evaluation find-hook → is_deleted=false. populate('classId') → Class hook → deleted class null.
  const { rows } = await query(
    `SELECT e.*, c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course
       FROM evaluations e
       LEFT JOIN classes c ON c.id = e.class_id AND c.is_deleted = false
      WHERE e.user_id = $1 AND e.is_deleted = false
      ORDER BY e.updated_at DESC`, [String(userId)]);
  return rows.map((e) => ({
    _id: e.id,
    classId: e.c_id ? { _id: e.c_id, classCode: e.c_code, courseName: e.c_course } : null,
    userId: e.user_id, level: e.level || '',
    grammarScore: Number(e.grammar_score), vocabularyScore: Number(e.vocabulary_score),
    pronunciationScore: Number(e.pronunciation_score), fluencyScore: Number(e.fluency_score),
    teacherComment: e.teacher_comment || '', createdBy: e.created_by || null,
    isDeleted: e.is_deleted, createdAt: e.created_at, updatedAt: e.updated_at,
  }));
};

const listShortTextAssessments = async (cohortIds) => {
  const conds = ['is_deleted = false', 'is_published = true', `items @> '[{"type":"short_text"}]'::jsonb`];
  const args = [];
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`cohort_id = ANY($${args.length})`); }
  const { rows } = await query(
    `SELECT * FROM assessments WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`, args);
  return Promise.all(rows.map(async (r) => assessmentRow(r, await cohortSummary(r.cohort_id))));
};

const countAttemptsByAssessment = async (assessmentIds) => {
  if (!assessmentIds.length) return [];
  const { rows } = await query(
    `SELECT assessment_id AS _id, count(*)::int AS count FROM assessment_attempts
      WHERE assessment_id = ANY($1) AND is_deleted = false GROUP BY assessment_id`, [assessmentIds.map(String)]);
  return rows.map((r) => ({ _id: r._id, count: r.count }));
};

const findCohortModeClassIds = async () => {
  const { rows } = await query(
    `SELECT id FROM classes
      WHERE is_deleted = false
        AND program_id IN (SELECT id FROM learning_programs WHERE scheduling_mode = ANY($1))`,
    [COHORT_SCHEDULING_MODES]);
  return rows.map((r) => r.id);
};

const listGradableClasses = async ({ includeIds = null, excludeIds = [] }) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (includeIds) { args.push(includeIds.map(String)); conds.push(`id = ANY($${args.length})`); }
  if (excludeIds && excludeIds.length) { args.push(excludeIds.map(String)); conds.push(`NOT (id = ANY($${args.length}))`); }
  const { rows } = await query(
    `SELECT id, class_code, course_name, status FROM classes WHERE ${conds.join(' AND ')}`, args);
  return rows
    .map((r) => ({ _id: r.id, classCode: r.class_code, courseName: r.course_name, status: r.status }))
    .sort((a, b) => cmp(a.classCode, b.classCode)); // Mongo {classCode:1} binary order
};

const countEvaluationsByClass = async (classIds) => {
  if (!classIds.length) return [];
  // Evaluation aggregate-HOOK injects {isDeleted:{$ne:true}} → is_deleted=false here.
  const { rows } = await query(
    `SELECT class_id AS _id, count(*)::int AS count FROM evaluations
      WHERE class_id = ANY($1) AND is_deleted = false GROUP BY class_id`, [classIds.map(String)]);
  return rows.map((r) => ({ _id: r._id, count: r.count }));
};

module.exports = {
  findCohort,
  createAssessment,
  findAssessmentById,
  updateAssessment,
  listAssessments,
  softDeleteAssessment,
  countAttempts,
  createAttempt,
  listAttempts,
  findAttemptById,
  updateAttemptGrade,
  findQuestionBankItemsByIds,
  listEvaluationsForLearner,
  listShortTextAssessments,
  countAttemptsByAssessment,
  findCohortModeClassIds,
  listGradableClasses,
  countEvaluationsByClass,
};
