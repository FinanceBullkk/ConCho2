const crypto = require('crypto');
const { query } = require('../../config/pg');

// evaluation/repository — POSTGRES impl (evaluations table, mig 011). Same
// interface as ./repository.mongo.
//
// Fidelity notes the parity test pins:
//   • upsert = INSERT … ON CONFLICT (class_id,user_id) DO UPDATE — the FULL
//     unique revives a trashed row in place (is_deleted always → false on
//     update, matching the Mongo reviving $set; a live row already had false).
//     created_by is NOT touched on update ($setOnInsert semantics).
//   • averageScore is computed in the row mapper — the Mongo side serializes
//     it as a schema virtual (toJSON virtuals: true).
//   • softDeleteById targets live rows only (second delete → null) and
//     returns the BEFORE shape (Mongo findByIdAndUpdate default) — the
//     returned row is patched back to isDeleted:false/deletedAt:null.
//   • populate ⇔ batch embeds with soft-delete drop (Class/User find-hooks
//     hide trashed refs → embedded doc becomes null).

const newId = () => crypto.randomBytes(12).toString('hex');

const round2 = (n) => Math.round(n * 100) / 100;

const evalRow = (r) => (r == null ? null : {
  _id: r.id, classId: r.class_id, userId: r.user_id,
  level: r.level == null ? '' : r.level,
  grammarScore: Number(r.grammar_score), vocabularyScore: Number(r.vocabulary_score),
  pronunciationScore: Number(r.pronunciation_score), fluencyScore: Number(r.fluency_score),
  teacherComment: r.teacher_comment == null ? '' : r.teacher_comment,
  createdBy: r.created_by || null,
  isDeleted: r.is_deleted, deletedAt: r.deleted_at,
  createdAt: r.created_at, updatedAt: r.updated_at,
  averageScore: round2(
    (Number(r.grammar_score) + Number(r.vocabulary_score)
      + Number(r.pronunciation_score) + Number(r.fluency_score)) / 4
  ),
});

const findForClassUserIncludingTrashed = async (classId, userId) => {
  const { rows } = await query(
    'SELECT * FROM evaluations WHERE class_id = $1 AND user_id = $2',
    [String(classId), String(userId)]);
  return rows[0] ? evalRow(rows[0]) : null;
};

const upsertEvaluation = async (classId, userId, { fields, createdBy }) => {
  // `reviving` is implicit here: DO UPDATE always clears the soft-delete pair
  // (equivalent to Mongo's conditional $set — a live row already holds those).
  const { rows } = await query(
    `INSERT INTO evaluations(id, class_id, user_id, level, grammar_score, vocabulary_score,
                             pronunciation_score, fluency_score, teacher_comment, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (class_id, user_id) DO UPDATE SET
       level = EXCLUDED.level,
       grammar_score = EXCLUDED.grammar_score,
       vocabulary_score = EXCLUDED.vocabulary_score,
       pronunciation_score = EXCLUDED.pronunciation_score,
       fluency_score = EXCLUDED.fluency_score,
       teacher_comment = EXCLUDED.teacher_comment,
       is_deleted = false, deleted_at = NULL, updated_at = now()
     RETURNING *`,
    [
      newId(), String(classId), String(userId),
      fields.level == null ? '' : fields.level,
      fields.grammarScore == null ? 0 : fields.grammarScore,
      fields.vocabularyScore == null ? 0 : fields.vocabularyScore,
      fields.pronunciationScore == null ? 0 : fields.pronunciationScore,
      fields.fluencyScore == null ? 0 : fields.fluencyScore,
      fields.teacherComment == null ? '' : fields.teacherComment,
      createdBy == null ? null : String(createdBy),
    ]);
  return evalRow(rows[0]);
};

const softDeleteById = async (id) => {
  const { rows } = await query(
    `UPDATE evaluations SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  if (!rows[0]) return null;
  // Mongo returns the PRE-update doc — reconstruct the before shape (the only
  // fields this update touches; updatedAt keeps the post-update stamp, an
  // accepted audit-diff nuance).
  const before = evalRow(rows[0]);
  before.isDeleted = false;
  before.deletedAt = null;
  return before;
};

// ── populate ⇔ batch embeds (soft-delete-aware, drop-to-null) ─────────────
const embedClasses = async (ids) => {
  if (!ids.length) return new Map();
  const { rows } = await query(
    `SELECT id, class_code, course_name FROM classes WHERE id = ANY($1) AND is_deleted = false`, [ids]);
  return new Map(rows.map((r) => [r.id, { _id: r.id, classCode: r.class_code, courseName: r.course_name }]));
};

const embedUsers = async (ids) => {
  if (!ids.length) return new Map();
  const { rows } = await query(
    `SELECT id, emp_code, name, department FROM users WHERE id = ANY($1) AND is_deleted = false`, [ids]);
  return new Map(rows.map((r) => [r.id, { _id: r.id, empCode: r.emp_code, name: r.name, department: r.department }]));
};

const populateRows = async (rows) => {
  const [classMap, userMap] = await Promise.all([
    embedClasses([...new Set(rows.map((r) => r.class_id))]),
    embedUsers([...new Set(rows.map((r) => r.user_id))]),
  ]);
  return rows.map((r) => {
    const out = evalRow(r);
    out.classId = classMap.get(r.class_id) || null;
    out.userId = userMap.get(r.user_id) || null;
    return out;
  });
};

const findAllPopulated = async (filter) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (filter.classId) { args.push(String(filter.classId)); conds.push(`class_id = $${args.length}`); }
  if (filter.userId) { args.push(String(filter.userId)); conds.push(`user_id = $${args.length}`); }
  const { rows } = await query(`SELECT * FROM evaluations WHERE ${conds.join(' AND ')}`, args);
  return populateRows(rows);
};

const findByIdPopulated = async (id) => {
  const { rows } = await query(
    'SELECT * FROM evaluations WHERE id = $1 AND is_deleted = false', [String(id)]);
  if (!rows[0]) return null;
  return (await populateRows(rows))[0];
};

// Active enrollments + embedded user (trashed users drop to null, mirroring
// the hook-filtered populate).
const findActiveEnrollmentsWithUsers = async (classId) => {
  const { rows } = await query(
    `SELECT e.id, e.user_id, u.id AS u_id, u.emp_code, u.name, u.department
       FROM enrollments e
       LEFT JOIN users u ON u.id = e.user_id AND u.is_deleted = false
      WHERE e.class_id = $1 AND e.status = 'Active'`, [String(classId)]);
  return rows.map((r) => ({
    _id: r.id,
    userId: r.u_id ? { _id: r.u_id, empCode: r.emp_code, name: r.name, department: r.department } : null,
  }));
};

module.exports = {
  findForClassUserIncludingTrashed,
  upsertEvaluation,
  softDeleteById,
  findAllPopulated,
  findByIdPopulated,
  findActiveEnrollmentsWithUsers,
};
