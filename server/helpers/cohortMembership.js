// PG-only runtime (Wave K D2d-0) — these membership probes used to run via
// Mongoose `Schedule.exists`/`Enrollment.exists`, reading the empty Mongo.
const { query } = require('../config/pg');

// Enrollment statuses that count as "still a member" of a cohort.
const ACTIVE_ENROLLMENT_STATUSES = ['Active', 'On-hold', 'Completed'];

// A learner participates in a cohort if they are on any session roster
// (team-based / leader-booked flow) OR hold a non-dropped enrollment
// (cohort-based L&D flow). Mirrors how completion/attendance treat membership.
// Shared by the feedback and assessment domains.
const isCohortParticipant = async (cohortId, userId) => {
  const [onRoster, enrolled] = await Promise.all([
    query(
      `SELECT 1 FROM schedules WHERE class_id = $1 AND $2 = ANY(enrolled_users) LIMIT 1`,
      [String(cohortId), String(userId)],
    ),
    query(
      `SELECT 1 FROM enrollments WHERE class_id = $1 AND user_id = $2 AND status = ANY($3) LIMIT 1`,
      [String(cohortId), String(userId), ACTIVE_ENROLLMENT_STATUSES],
    ),
  ]);
  return Boolean(onRoster.rows.length || enrolled.rows.length);
};

module.exports = { isCohortParticipant, ACTIVE_ENROLLMENT_STATUSES };
