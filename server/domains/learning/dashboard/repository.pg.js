const { query } = require('../../../config/pg');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');

// ──────────────────────────────────────────────────────────
// learning/dashboard/repository — POSTGRES impl. Same interface as
// ./repository.mongo. Batched dashboard aggregations (Admin org-wide or
// Teacher cohort-scoped via an optional cohortIds array).
//
// Fidelity notes the parity test pins:
//   • ATTENDED_STATUSES = P|L; cohortScope null = org-wide; soft-delete explicit
//     on Certificate/AssessmentAttempt/Feedback/User/Department/Program reads,
//     NONE on Attendance/Schedule(status)/Enrollment(status).
//   • $ifNull department → COALESCE(department,'Unassigned'); $cond/$avg → FILTER/AVG;
//     completionPolicy jsonb predicates → jsonb operators.
// ──────────────────────────────────────────────────────────

const ATTENDED_STATUSES = ['P', 'L'];
const DAY_MS = 86400000;
const iso = (d) => new Date(d).toISOString();

const scheduleIdsForCohorts = async (cohortIds) => {
  const { rows } = await query(
    `SELECT id FROM schedules WHERE class_id = ANY($1) AND status = 'scheduled'`, [cohortIds.map(String)]);
  return rows.map((r) => r.id);
};

const attendanceTotals = async (cohortIds) => {
  const args = [ATTENDED_STATUSES];
  let where = '';
  if (cohortIds) {
    const scheduleIds = await scheduleIdsForCohorts(cohortIds);
    if (!scheduleIds.length) return { totalRecords: 0, presentRecords: 0 };
    args.push(scheduleIds); where = `WHERE schedule_id = ANY($2)`;
  }
  const { rows } = await query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = ANY($1))::int AS present
       FROM attendances ${where}`, args);
  return { totalRecords: rows[0].total, presentRecords: rows[0].present };
};

const sessionCounts = async (cohortIds, now) => {
  const conds = [`status = 'scheduled'`];
  const args = [];
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`class_id = ANY($${args.length})`); }
  const base = conds.join(' AND ');
  args.push(iso(now)); const nowP = `$${args.length}`;
  args.push(iso(new Date(now.getTime() + 7 * DAY_MS))); const in7P = `$${args.length}`;
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE start_time > ${nowP})::int AS upcoming,
       count(*) FILTER (WHERE start_time > ${nowP} AND start_time <= ${in7P})::int AS next7,
       count(*) FILTER (WHERE end_time < ${nowP})::int AS past
     FROM schedules WHERE ${base}`, args);
  return { upcoming: rows[0].upcoming, next7Days: rows[0].next7, past: rows[0].past };
};

const certBase = (cohortIds, args) => {
  const conds = [`status = 'Issued'`, 'is_deleted = false'];
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`cohort_id = ANY($${args.length})`); }
  return conds.join(' AND ');
};

const certificateExpiryCounts = async (cohortIds, now) => {
  const args = [];
  const base = certBase(cohortIds, args);
  args.push(iso(now)); const nowP = `$${args.length}`;
  args.push(iso(new Date(now.getTime() + 30 * DAY_MS))); const d30P = `$${args.length}`;
  args.push(iso(new Date(now.getTime() + 60 * DAY_MS))); const d60P = `$${args.length}`;
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < ${nowP})::int AS expired,
       count(*) FILTER (WHERE valid_until >= ${nowP} AND valid_until <= ${d30P})::int AS expiring30,
       count(*) FILTER (WHERE valid_until >= ${nowP} AND valid_until <= ${d60P})::int AS expiring60
     FROM certificates WHERE ${base}`, args);
  return { expired: rows[0].expired, expiring30: rows[0].expiring30, expiring60: rows[0].expiring60 };
};

const listExpiringCertificates = async (cohortIds, now, horizon, limit) => {
  const args = [];
  const base = certBase(cohortIds, args);
  args.push(iso(now)); const nowP = `$${args.length}`;
  args.push(iso(horizon)); const hP = `$${args.length}`;
  args.push(limit); const limP = `$${args.length}`;
  const { rows } = await query(
    `SELECT id, certificate_number, learner_name, program_name, valid_until, user_id, program_id
       FROM certificates WHERE ${base} AND valid_until >= ${nowP} AND valid_until <= ${hP}
      ORDER BY valid_until ASC LIMIT ${limP}`, args);
  return rows.map((r) => ({
    _id: r.id, certificateNumber: r.certificate_number, learnerName: r.learner_name,
    programName: r.program_name, validUntil: r.valid_until, userId: r.user_id || null, programId: r.program_id || null,
  }));
};

const assessmentTotals = async (cohortIds) => {
  const args = [];
  const conds = ['is_deleted = false'];
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`cohort_id = ANY($${args.length})`); }
  const { rows } = await query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE passed)::int AS passed
       FROM assessment_attempts WHERE ${conds.join(' AND ')}`, args);
  return { totalAttempts: rows[0].total, passedAttempts: rows[0].passed };
};

const feedbackStats = async (cohortIds) => {
  const args = [];
  const conds = ['is_deleted = false'];
  if (cohortIds) { args.push(cohortIds.map(String)); conds.push(`cohort_id = ANY($${args.length})`); }
  const where = conds.join(' AND ');
  const [overall, byProgram] = await Promise.all([
    query(`SELECT count(*)::int AS count, avg(rating)::float AS avg FROM feedbacks WHERE ${where}`, args),
    query(
      `SELECT program_id AS _id, count(*)::int AS count, avg(rating)::float AS avg
         FROM feedbacks WHERE ${where} AND program_id IS NOT NULL
        GROUP BY program_id ORDER BY count DESC LIMIT 10`, args),
  ]);
  const o = overall.rows[0];
  return {
    overall: { count: o.count, avg: o.count ? o.avg : null },
    byProgram: byProgram.rows.map((r) => ({ _id: r._id, count: r.count, avg: r.avg })),
  };
};

const listProgramNames = async (programIds) => {
  if (!programIds.length) return [];
  const { rows } = await query(`SELECT id, name FROM learning_programs WHERE id = ANY($1)`, [programIds.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};

const coverageCounts = async (windowStart) => {
  const ws = iso(windowStart);
  const [active, att, enr] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM users WHERE role = 'Participant' AND status = 'Active' AND is_deleted = false`),
    query(`SELECT DISTINCT user_id FROM attendances WHERE created_at >= $1`, [ws]),
    query(`SELECT DISTINCT user_id FROM enrollments WHERE created_at >= $1 AND status = ANY($2)`, [ws, ACTIVE_ENROLLMENT_STATUSES]),
  ]);
  const engagedIds = [...new Set([...att.rows, ...enr.rows].map((r) => String(r.user_id)))];
  let engaged = 0;
  if (engagedIds.length) {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM users
        WHERE role = 'Participant' AND status = 'Active' AND is_deleted = false AND id = ANY($1)`, [engagedIds]);
    engaged = rows[0].n;
  }
  return { activeParticipants: active.rows[0].n, engagedParticipants: engaged };
};

const getSetupSignals = async () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((now.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // live program = status != archived; a configured policy = any non-default rule.
  const livePrograms = `status <> 'archived' AND is_deleted = false`;
  const policyMatch =
    `((completion_policy->>'attendanceThresholdPercent')::numeric > 0
      OR (completion_policy->>'requiresAssessment')::boolean = true
      OR (completion_policy->>'requiresFeedback')::boolean = true)`;

  const c = async (sql, args = []) => (await query(sql, args)).rows[0].n;
  const [
    departments, programs, customRoles, policyPrograms, coordinators,
    totalEmployees, activeLearners, sessionsThisWeek, pendingEnrollment,
  ] = await Promise.all([
    c(`SELECT count(*)::int AS n FROM departments WHERE is_deleted = false`),
    c(`SELECT count(*)::int AS n FROM learning_programs WHERE ${livePrograms}`),
    c(`SELECT count(*)::int AS n FROM roles WHERE system = false AND is_deleted = false`),
    c(`SELECT count(*)::int AS n FROM learning_programs WHERE ${livePrograms} AND ${policyMatch}`),
    c(`SELECT count(*)::int AS n FROM users WHERE role = 'Coordinator' AND is_deleted = false`),
    c(`SELECT count(*)::int AS n FROM users WHERE is_deleted = false AND status NOT IN ('Dropped','Transferred')`),
    c(`SELECT count(*)::int AS n FROM users WHERE role = 'Participant' AND status = 'Active' AND is_deleted = false`),
    c(`SELECT count(*)::int AS n FROM schedules WHERE start_time >= $1 AND start_time < $2`, [iso(weekStart), iso(weekEnd)]),
    c(`SELECT count(*)::int AS n FROM users WHERE status = 'Waiting for class' AND is_deleted = false`),
  ]);
  return {
    departments, programs, customRoles, policyPrograms, coordinators,
    totalEmployees, activeLearners, sessionsThisWeek, pendingEnrollment,
  };
};

const headcountByDepartment = async () => {
  const { rows } = await query(
    `SELECT COALESCE(department,'Unassigned') AS _id, count(*)::int AS headcount
       FROM users WHERE is_deleted = false AND status NOT IN ('Dropped','Transferred')
      GROUP BY COALESCE(department,'Unassigned')`);
  return rows.map((r) => ({ _id: r._id, headcount: r.headcount }));
};

const completedUsersByDepartment = async () => {
  const ids = await query(`SELECT DISTINCT user_id FROM certificates WHERE is_deleted = false`);
  const certUserIds = ids.rows.map((r) => r.user_id);
  if (!certUserIds.length) return [];
  const { rows } = await query(
    `SELECT COALESCE(department,'Unassigned') AS _id, count(*)::int AS completed
       FROM users WHERE id = ANY($1) AND is_deleted = false
      GROUP BY COALESCE(department,'Unassigned')`, [certUserIds]);
  return rows.map((r) => ({ _id: r._id, completed: r.completed }));
};

module.exports = {
  attendanceTotals,
  sessionCounts,
  certificateExpiryCounts,
  listExpiringCertificates,
  assessmentTotals,
  feedbackStats,
  listProgramNames,
  coverageCounts,
  getSetupSignals,
  headcountByDepartment,
  completedUsersByDepartment,
};
