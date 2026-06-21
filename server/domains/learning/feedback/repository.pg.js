const crypto = require('crypto');
const { query } = require('../../../config/pg');
const { isCohortParticipant } = require('../../../helpers/cohortMembership');

// learning/feedback/repository — POSTGRES impl. Same interface as ./repository.mongo.
// feedbacks table (migration 011). upsertFeedback = idempotent submit via
// INSERT … ON CONFLICT(cohort_id,user_id). populate('userId'/'cohortId') → LEFT
// JOIN … is_deleted=false (a soft-deleted ref reads null). isCohortParticipant is
// a pure helper re-exported as-is.

const newId = () => crypto.randomBytes(12).toString('hex');

const feedbackRow = (r) => (r == null ? null : {
  _id: r.id, cohortId: r.cohort_id, userId: r.user_id, programId: r.program_id || null,
  rating: r.rating, contentRating: r.content_rating == null ? null : r.content_rating,
  instructorRating: r.instructor_rating == null ? null : r.instructor_rating,
  comment: r.comment || '', submittedBy: r.submitted_by || null, isDeleted: r.is_deleted,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const findCohort = async (cohortId) => {
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, is_deleted FROM classes WHERE id = $1 AND is_deleted = false`,
    [String(cohortId)]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { _id: r.id, classCode: r.class_code, courseName: r.course_name, programId: r.program_id || null, isDeleted: r.is_deleted };
};

const findFeedback = async (cohortId, userId) => {
  const { rows } = await query(
    `SELECT * FROM feedbacks WHERE cohort_id = $1 AND user_id = $2 AND is_deleted = false LIMIT 1`,
    [String(cohortId), String(userId)]);
  return rows[0] ? feedbackRow(rows[0]) : null;
};

// Mongoose strips `undefined` from $set → that field is NOT updated (keeps the
// existing value). Mirror that: ON CONFLICT updates only the fields the caller
// actually provided (data[k] !== undefined); an explicit null IS applied.
const UP_FIELDS = { programId: 'program_id', rating: 'rating', contentRating: 'content_rating', instructorRating: 'instructor_rating', comment: 'comment', submittedBy: 'submitted_by' };
const upsertFeedback = async (data) => {
  const present = Object.keys(UP_FIELDS).filter((k) => data[k] !== undefined);
  const updates = present.map((k) => `${UP_FIELDS[k]} = EXCLUDED.${UP_FIELDS[k]}`);
  updates.push('is_deleted = false', 'updated_at = now()');
  const { rows } = await query(
    `INSERT INTO feedbacks(id,cohort_id,user_id,program_id,rating,content_rating,instructor_rating,comment,submitted_by,is_deleted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)
     ON CONFLICT (cohort_id, user_id) DO UPDATE SET ${updates.join(', ')} RETURNING *`,
    [
      newId(), String(data.cohortId), String(data.userId), data.programId == null ? null : String(data.programId),
      data.rating == null ? null : data.rating, data.contentRating == null ? null : data.contentRating,
      data.instructorRating == null ? null : data.instructorRating,
      data.comment == null ? '' : data.comment, data.submittedBy == null ? null : String(data.submittedBy),
    ]);
  return feedbackRow(rows[0]);
};

const listFeedback = async ({ cohortId, learnerId }) => {
  const conds = ['f.is_deleted = false'];
  const args = [];
  if (cohortId) { args.push(String(cohortId)); conds.push(`f.cohort_id = $${args.length}`); }
  if (learnerId) { args.push(String(learnerId)); conds.push(`f.user_id = $${args.length}`); }
  const { rows } = await query(
    `SELECT f.*, u.id AS u_id, u.emp_code AS u_emp, u.name AS u_name, u.department AS u_dept,
            c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course
       FROM feedbacks f
       LEFT JOIN users u   ON u.id = f.user_id   AND u.is_deleted = false
       LEFT JOIN classes c ON c.id = f.cohort_id AND c.is_deleted = false
      WHERE ${conds.join(' AND ')}
      ORDER BY f.updated_at DESC`, args);
  return rows.map((r) => ({
    ...feedbackRow(r),
    userId: r.u_id ? { _id: r.u_id, empCode: r.u_emp, name: r.u_name, department: r.u_dept } : null,
    cohortId: r.c_id ? { _id: r.c_id, classCode: r.c_code, courseName: r.c_course } : null,
  }));
};

module.exports = {
  findCohort,
  isCohortParticipant,
  findFeedback,
  upsertFeedback,
  listFeedback,
};
