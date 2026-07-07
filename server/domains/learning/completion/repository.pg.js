const crypto = require('crypto');
const { query } = require('../../../config/pg');

// ──────────────────────────────────────────────────────────
// learning/completion/repository — POSTGRES impl. Same interface as
// ./repository.mongo. The completion engine reads four evidence tables
// (schedules/attendances/evaluations/feedbacks/assessment_attempts) + programs,
// and writes/reads certificates.
//
// Fidelity notes the parity test pins:
//   • Soft-delete predicates are EXPLICIT (no Mongo pre-hooks): findEvaluation/
//     findFeedback/findPassingAttempt/findActiveCertificate/findCertificateById/
//     listCertificates/findByVerificationCode all filter is_deleted = false;
//     findCohort + findLearnerName hide soft-deleted rows like the Class/User hooks.
//   • resolveCompletionContext's no-program branch OMITS certificateValidityDays
//     (Mongo returns the key only on the program branch) — kept identical so the
//     JSON shape matches.
//   • createCertificate maps the Postgres unique violation (23505 — the QB-008
//     partial-unique race) to a Mongo-style { code: 11000 } error so the use-case's
//     existing race catch surfaces the same friendly 409 on both backends.
//   • listCertificates LEFT JOINs users AND is_deleted=false → a deleted learner
//     populates to null, exactly like Mongo populate over the User soft-delete hook.
//   • Score columns are double precision → JS numbers (a numeric type would arrive
//     as strings and break the averageScore math + scorePercent ordering).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');

const ATTENDED_STATUSES = ['P', 'L'];

const DEFAULT_POLICY = Object.freeze({
  attendanceThresholdPercent: 0,
  requiresAssessment: false,
  requiresFeedback: false,
});

// ── Row → camelCase shape mappers (mirror the Mongo lean docs) ──
const evaluationRow = (r) => (r == null ? null : {
  _id: r.id, classId: r.class_id, userId: r.user_id, level: r.level || '',
  grammarScore: Number(r.grammar_score), vocabularyScore: Number(r.vocabulary_score),
  pronunciationScore: Number(r.pronunciation_score), fluencyScore: Number(r.fluency_score),
  teacherComment: r.teacher_comment || '', createdBy: r.created_by || null,
  isDeleted: r.is_deleted, createdAt: r.created_at, updatedAt: r.updated_at,
});

const feedbackRow = (r) => (r == null ? null : {
  _id: r.id, cohortId: r.cohort_id, userId: r.user_id, programId: r.program_id || null,
  rating: r.rating == null ? null : Number(r.rating),
  contentRating: r.content_rating == null ? null : Number(r.content_rating),
  instructorRating: r.instructor_rating == null ? null : Number(r.instructor_rating),
  comment: r.comment || '', submittedBy: r.submitted_by || null,
  isDeleted: r.is_deleted, createdAt: r.created_at, updatedAt: r.updated_at,
});

const attemptRow = (r) => (r == null ? null : {
  _id: r.id, assessmentId: r.assessment_id, userId: r.user_id, cohortId: r.cohort_id,
  answers: r.answers || [], score: Number(r.score), maxScore: Number(r.max_score),
  scorePercent: Number(r.score_percent), passed: r.passed, submittedAt: r.submitted_at,
  isDeleted: r.is_deleted, createdAt: r.created_at, updatedAt: r.updated_at,
});

const certRow = (r) => (r == null ? null : {
  _id: r.id,
  certificateNumber: r.certificate_number,
  verificationCode: r.verification_code,
  userId: r.user_id || null,
  cohortId: r.cohort_id || null,
  programId: r.program_id || null,
  learnerName: r.learner_name || '',
  programName: r.program_name || '',
  cohortCode: r.cohort_code || '',
  completionSnapshot: r.completion_snapshot || {},
  issuedBy: r.issued_by || null,
  issuedAt: r.issued_at,
  validFrom: r.valid_from,
  validUntil: r.valid_until,
  validityDays: r.validity_days == null ? null : Number(r.validity_days),
  status: r.status,
  revokedAt: r.revoked_at,
  revokedReason: r.revoked_reason || '',
  isDeleted: r.is_deleted,
  deletedAt: r.deleted_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ── Cohort + policy resolution ────────────────────────────
const findCohort = async (cohortId) => {
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, is_deleted FROM classes WHERE id = $1 AND is_deleted = false`,
    [String(cohortId)]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { _id: r.id, classCode: r.class_code, courseName: r.course_name, programId: r.program_id || null, isDeleted: r.is_deleted };
};

const resolveCompletionContext = async (cohort) => {
  if (!cohort?.programId) {
    return { policy: { ...DEFAULT_POLICY }, programId: null, programName: cohort?.courseName || '' };
  }
  const { rows } = await query(
    `SELECT name, completion_policy, certificate_validity_days FROM learning_programs WHERE id = $1`,
    [String(cohort.programId)]);
  const program = rows[0] || null;
  return {
    policy: { ...DEFAULT_POLICY, ...(program?.completion_policy || {}) },
    programId: cohort.programId,
    programName: (program && program.name) || cohort.courseName || '',
    certificateValidityDays: (program && program.certificate_validity_days) || null,
  };
};

// ── Attendance counters ───────────────────────────────────
const countCohortSessions = async (cohortId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM schedules WHERE class_id = $1 AND status = 'scheduled'`,
    [String(cohortId)]);
  return rows[0].n;
};

const countAttendedSessions = async (cohortId, userId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM attendances
      WHERE user_id = $2 AND status = ANY($3)
        AND schedule_id IN (SELECT id FROM schedules WHERE class_id = $1 AND status = 'scheduled')`,
    [String(cohortId), String(userId), ATTENDED_STATUSES]);
  return rows[0].n;
};

// ── Evidence reads (each filters out soft-deleted rows) ───
const findEvaluation = async (cohortId, userId) => {
  const { rows } = await query(
    `SELECT * FROM evaluations WHERE class_id = $1 AND user_id = $2 AND is_deleted = false LIMIT 1`,
    [String(cohortId), String(userId)]);
  return rows[0] ? evaluationRow(rows[0]) : null;
};

const findFeedback = async (cohortId, userId) => {
  const { rows } = await query(
    `SELECT * FROM feedbacks WHERE cohort_id = $1 AND user_id = $2 AND is_deleted = false LIMIT 1`,
    [String(cohortId), String(userId)]);
  return rows[0] ? feedbackRow(rows[0]) : null;
};

const findPassingAttempt = async (cohortId, userId) => {
  const { rows } = await query(
    `SELECT * FROM assessment_attempts
      WHERE cohort_id = $1 AND user_id = $2 AND passed = true AND is_deleted = false
      ORDER BY score_percent DESC LIMIT 1`,
    [String(cohortId), String(userId)]);
  return rows[0] ? attemptRow(rows[0]) : null;
};

const findLearnerName = async (userId) => {
  const { rows } = await query(
    `SELECT id, name, emp_code FROM users WHERE id = $1 AND is_deleted = false`,
    [String(userId)]);
  return rows[0] ? { _id: rows[0].id, name: rows[0].name, empCode: rows[0].emp_code } : null;
};

// ── Certificate persistence ───────────────────────────────
const findActiveCertificate = async (userId, cohortId) => {
  const { rows } = await query(
    `SELECT * FROM certificates WHERE user_id = $1 AND cohort_id = $2 AND status = 'Issued' AND is_deleted = false LIMIT 1`,
    [String(userId), String(cohortId)]);
  return rows[0] ? certRow(rows[0]) : null;
};

const createCertificate = async (data) => {
  try {
    const { rows } = await query(
      `INSERT INTO certificates
        (id, certificate_number, verification_code, user_id, cohort_id, program_id,
         learner_name, program_name, cohort_code, completion_snapshot, issued_by,
         issued_at, valid_from, valid_until, validity_days, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        newId(), data.certificateNumber, data.verificationCode, String(data.userId),
        String(data.cohortId), data.programId == null ? null : String(data.programId),
        data.learnerName || '', data.programName || '', data.cohortCode || '',
        JSON.stringify(data.completionSnapshot || {}),
        data.issuedBy == null ? null : String(data.issuedBy),
        (data.issuedAt ? new Date(data.issuedAt) : new Date()).toISOString(),
        data.validFrom ? new Date(data.validFrom).toISOString() : null,
        data.validUntil ? new Date(data.validUntil).toISOString() : null,
        data.validityDays == null ? null : data.validityDays,
        data.status || 'Issued',
      ]);
    return certRow(rows[0]);
  } catch (error) {
    // QB-008: the partial-unique {user_id,cohort_id} race. Map the Postgres unique
    // violation to the Mongo duplicate-key shape so use-cases.js surfaces a 409.
    if (error && error.code === '23505') {
      const dup = new Error('An active certificate already exists for this learner and cohort');
      dup.code = 11000;
      throw dup;
    }
    throw error;
  }
};

const findCertificateById = async (id) => {
  const { rows } = await query(`SELECT * FROM certificates WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? certRow(rows[0]) : null;
};

const listCertificates = async ({ cohortId, learnerId }) => {
  const conds = ['cert.is_deleted = false'];
  const args = [];
  if (cohortId) { args.push(String(cohortId)); conds.push(`cert.cohort_id = $${args.length}`); }
  if (learnerId) { args.push(String(learnerId)); conds.push(`cert.user_id = $${args.length}`); }
  const { rows } = await query(
    `SELECT cert.*, u.id AS u_id, u.emp_code AS u_emp, u.name AS u_name, u.department AS u_dept
       FROM certificates cert
       LEFT JOIN users u ON u.id = cert.user_id AND u.is_deleted = false
      WHERE ${conds.join(' AND ')}
      ORDER BY cert.issued_at DESC`, args);
  return rows.map((r) => {
    const c = certRow(r);
    c.userId = r.u_id ? { _id: r.u_id, empCode: r.u_emp, name: r.u_name, department: r.u_dept } : null;
    return c;
  });
};

const markRevoked = async (id, reason) => {
  const { rows } = await query(
    `UPDATE certificates SET status = 'Revoked', revoked_at = now(), revoked_reason = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [String(id), reason || '']);
  return rows[0] ? certRow(rows[0]) : null;
};

const findByVerificationCode = async (code) => {
  const { rows } = await query(
    `SELECT * FROM certificates WHERE verification_code = $1 AND is_deleted = false LIMIT 1`,
    [String(code)]);
  return rows[0] ? certRow(rows[0]) : null;
};

// ── Recert auto-assignment scan reads (phase-05 A2) ───────
// recertify_policy is jsonb; `autoAssign: true` ⇔ jsonb boolean true.
const findAutoRecertPrograms = async () => {
  const { rows } = await query(
    `SELECT id, name FROM learning_programs WHERE (recertify_policy ->> 'autoAssign')::boolean IS TRUE`);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};

const findExpiringIssuedCertificates = async (programIds, from, to) => {
  const { rows } = await query(
    `SELECT id, user_id, program_id, valid_until, certificate_number, program_name
       FROM certificates
      WHERE status = 'Issued' AND is_deleted = false
        AND program_id = ANY($1::text[])
        AND valid_until IS NOT NULL AND valid_until >= $2 AND valid_until <= $3`,
    [(programIds || []).map(String), new Date(from).toISOString(), new Date(to).toISOString()]);
  return rows.map((r) => ({
    _id: r.id, userId: r.user_id || null, programId: r.program_id || null,
    validUntil: r.valid_until, certificateNumber: r.certificate_number,
    programName: r.program_name || '',
  }));
};

module.exports = {
  ATTENDED_STATUSES,
  DEFAULT_POLICY,
  findCohort,
  resolveCompletionContext,
  countCohortSessions,
  countAttendedSessions,
  findEvaluation,
  findFeedback,
  findPassingAttempt,
  findLearnerName,
  findActiveCertificate,
  createCertificate,
  findCertificateById,
  listCertificates,
  markRevoked,
  findByVerificationCode,
  findAutoRecertPrograms,
  findExpiringIssuedCertificates,
};
