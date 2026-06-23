const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// assessment/question-bank-repository — POSTGRES impl. Same interface as
// ./question-bank-repository.mongo. Question-bank item CRUD.
//
// Fidelity notes the parity test pins:
//   • soft-delete is explicit (is_deleted=false) on every read/update — the model
//     has NO Mongoose hooks; softDelete (findByIdAndUpdate) has no is_deleted guard.
//   • options/correct_option_indexes/accepted_answers default to UNDEFINED (absent)
//     in Mongo → the row mapper OMITS them when NULL; tags defaults to [].
//   • list search: prompt $regex/$options:'i' → POSIX case-insensitive `~*`;
//     tag filter → `= ANY(tags)`; sort updatedAt desc.
//   • arrays → text[]/integer[]; points → double precision (Number).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const idOrNull = (v) => (v == null ? null : String(v));

const qRow = (r) => {
  if (r == null) return null;
  const o = {
    _id: r.id, type: r.type, prompt: r.prompt,
    points: Number(r.points), explanation: r.explanation || '',
    tags: (r.tags || []).map(String),
    programId: r.program_id || null, cohortId: r.cohort_id || null, createdBy: r.created_by || null,
    isDeleted: r.is_deleted, deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
  // default:undefined fields are omitted (absent) when unset — mirror Mongo lean.
  if (r.options != null) o.options = (r.options || []).map(String);
  if (r.correct_option_indexes != null) o.correctOptionIndexes = (r.correct_option_indexes || []).map(Number);
  if (r.accepted_answers != null) o.acceptedAnswers = (r.accepted_answers || []).map(String);
  return o;
};

const arr = (v) => (v == null ? null : v);

const createQuestion = async (data) => {
  const { rows } = await query(
    `INSERT INTO assessment_questions
       (id, type, prompt, options, correct_option_indexes, accepted_answers, points, explanation, tags,
        program_id, cohort_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      newId(), data.type, data.prompt, arr(data.options), arr(data.correctOptionIndexes), arr(data.acceptedAnswers),
      data.points == null ? 1 : data.points, data.explanation == null ? '' : data.explanation,
      data.tags == null ? [] : data.tags, idOrNull(data.programId), idOrNull(data.cohortId), idOrNull(data.createdBy),
    ]);
  return qRow(rows[0]);
};

const findQuestionById = async (id) => {
  const { rows } = await query(`SELECT * FROM assessment_questions WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? qRow(rows[0]) : null;
};

const COL = {
  type: 'type', prompt: 'prompt', options: 'options', correctOptionIndexes: 'correct_option_indexes',
  acceptedAnswers: 'accepted_answers', points: 'points', explanation: 'explanation', tags: 'tags',
  programId: 'program_id', cohortId: 'cohort_id',
};
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const colVal = (k, v) => {
  if (k === 'options' || k === 'correctOptionIndexes' || k === 'acceptedAnswers' || k === 'tags') return arr(v);
  if (k === 'programId' || k === 'cohortId') return idOrNull(v);
  return v;
};

const updateQuestion = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(COL)) {
    if (hasOwn(data, k)) { args.push(colVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findQuestionById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE assessment_questions SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? qRow(rows[0]) : null;
};

const listQuestions = async ({ programId, cohortId, type, tag, q } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (programId) { args.push(String(programId)); conds.push(`program_id = $${args.length}`); }
  if (cohortId) { args.push(String(cohortId)); conds.push(`cohort_id = $${args.length}`); }
  if (type) { args.push(type); conds.push(`type = $${args.length}`); }
  if (tag) { args.push(tag); conds.push(`$${args.length} = ANY(tags)`); }
  if (q) { args.push(q); conds.push(`prompt ~* $${args.length}`); } // mirrors $regex/$options:'i'
  const { rows } = await query(
    `SELECT * FROM assessment_questions WHERE ${conds.join(' AND ')} ORDER BY updated_at DESC`, args);
  return rows.map(qRow);
};

// findByIdAndUpdate has NO is_deleted guard in Mongo → no predicate here either.
const softDeleteQuestion = async (id) => {
  const { rows } = await query(
    `UPDATE assessment_questions SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`, [String(id)]);
  return rows[0] ? qRow(rows[0]) : null;
};

module.exports = {
  createQuestion,
  findQuestionById,
  updateQuestion,
  listQuestions,
  softDeleteQuestion,
};
