// PG-only runtime (Wave K D2d-0). These reads used to run via Mongoose models,
// which — after the Postgres cutover — hit the now-empty Mongo and reported every
// learner as having completed nothing (so prerequisites never gated). Now they
// read Postgres directly.
const { query } = require('../../../config/pg');
const completionUseCases = require('../completion/use-cases');
const { ServiceError } = require('../../../helpers/ServiceError');

const PARTICIPATING_STATUSES = ['Active', 'On-hold', 'Completed'];

// De-dupe an id list by string identity, preserving order + the original values.
const uniqIds = (ids) => {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    const key = String(id);
    if (key && !seen.has(key)) { seen.add(key); out.push(id); }
  }
  return out;
};

// Run async `fn` over `items` with at most `limit` in flight (no extra dep) —
// keeps the residual completion evaluations from flooding Mongo with one query
// fan-out per learner at once.
const mapWithConcurrency = async (items, limit, fn) => {
  const queue = [...items];
  const runNext = async () => {
    while (queue.length) {
      const item = queue.shift();
      // eslint-disable-next-line no-await-in-loop -- worker drains the shared queue
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, runNext));
};

// Has the learner completed ANY cohort of `programId`?
//   Fast path: an Issued certificate for the program (durable proof).
//   Otherwise: evaluate the completion engine across the cohorts of that
//   program the learner actually participated in (enrollment or session roster).
const hasCompletedProgram = async (userId, programId) => {
  const cert = await query(
    `SELECT 1 FROM certificates
      WHERE user_id = $1 AND program_id = $2 AND status = 'Issued' AND is_deleted = false LIMIT 1`,
    [String(userId), String(programId)],
  );
  if (cert.rows.length) return true;

  const cohorts = await query(
    `SELECT DISTINCT id FROM classes WHERE program_id = $1 AND is_deleted = false`,
    [String(programId)],
  );
  const cohortIds = cohorts.rows.map((r) => r.id);
  if (!cohortIds.length) return false;

  const [enrolled, rostered] = await Promise.all([
    query(
      `SELECT DISTINCT class_id FROM enrollments
        WHERE user_id = $1 AND class_id = ANY($2) AND status = ANY($3)`,
      [String(userId), cohortIds, PARTICIPATING_STATUSES],
    ),
    query(
      `SELECT DISTINCT class_id FROM schedules
        WHERE class_id = ANY($1) AND $2 = ANY(enrolled_users) AND status = 'scheduled'`,
      [cohortIds, String(userId)],
    ),
  ]);

  const participated = [...new Set(
    [...enrolled.rows, ...rostered.rows].map((r) => String(r.class_id)),
  )];
  for (const cohortId of participated) {
    // eslint-disable-next-line no-await-in-loop -- learners have few cohorts/program; enroll is a rare op
    const completion = await completionUseCases.evaluateCompletion(cohortId, userId);
    if (completion.complete) return true;
  }
  return false;
};

// Batched variant of hasCompletedProgram for a SET of learners against ONE
// program. Semantics are IDENTICAL to calling hasCompletedProgram per user (same
// cert fast-path, same cohort discovery, same completion-engine check with the
// same any-participated-cohort short-circuit) — but the cheap discriminators
// (program-level Issued certificate + cohort list + participation) resolve in a
// constant number of queries instead of O(users), and the residual completion
// evaluations run with bounded concurrency. Used by the org-wide compliance
// report to kill a per-user N+1 fan-out across whole departments (audit P1).
// Returns a Set<String(userId)> of learners who have completed the program.
const completedProgramUserIds = async (userIds, programId) => {
  const ids = uniqIds(userIds);
  const complete = new Set();
  if (!ids.length || !programId) return complete;

  // Fast path: an Issued program-level certificate (one query for all learners).
  const certRows = await query(
    `SELECT DISTINCT user_id FROM certificates
      WHERE user_id = ANY($1) AND program_id = $2 AND status = 'Issued' AND is_deleted = false`,
    [ids.map(String), String(programId)],
  );
  certRows.rows.forEach((r) => complete.add(String(r.user_id)));

  const remaining = ids.filter((id) => !complete.has(String(id)));
  if (!remaining.length) return complete;

  const cohorts = await query(
    `SELECT DISTINCT id FROM classes WHERE program_id = $1 AND is_deleted = false`,
    [String(programId)],
  );
  const cohortIds = cohorts.rows.map((r) => r.id);
  if (!cohortIds.length) return complete;

  // Participation discovery (batched): enrolled OR session-rostered — the same
  // two signals the per-user path uses, across all remaining learners at once.
  const remainingIds = remaining.map(String);
  const [enrolledRows, rosteredRows] = await Promise.all([
    query(
      `SELECT user_id, class_id FROM enrollments
        WHERE user_id = ANY($1) AND class_id = ANY($2) AND status = ANY($3)`,
      [remainingIds, cohortIds, PARTICIPATING_STATUSES],
    ),
    query(
      `SELECT class_id, enrolled_users FROM schedules
        WHERE class_id = ANY($1) AND enrolled_users && $2 AND status = 'scheduled'`,
      [cohortIds, remainingIds],
    ),
  ]);

  const remainingSet = new Set(remainingIds);
  const cohortsByUser = new Map(); // String(userId) -> Set<String(cohortId)>
  const addParticipation = (userId, classId) => {
    const u = String(userId);
    if (!cohortsByUser.has(u)) cohortsByUser.set(u, new Set());
    cohortsByUser.get(u).add(String(classId));
  };
  enrolledRows.rows.forEach((row) => addParticipation(row.user_id, row.class_id));
  rosteredRows.rows.forEach((row) => {
    (row.enrolled_users || []).forEach((u) => {
      if (remainingSet.has(String(u))) addParticipation(u, row.class_id);
    });
  });

  // Residual: run the completion engine ONLY for participants without a cert.
  // Each learner short-circuits on its first completed cohort (identical to the
  // per-user path); bounded concurrency keeps DB load sane.
  await mapWithConcurrency([...cohortsByUser.entries()], 8, async ([userId, cohortSet]) => {
    for (const cohortId of cohortSet) {
      // eslint-disable-next-line no-await-in-loop -- few cohorts/user, early-exit on first complete
      const completion = await completionUseCases.evaluateCompletion(cohortId, userId);
      if (completion.complete) { complete.add(userId); return; }
    }
  });

  return complete;
};

// Throw 422 if the cohort's program declares prerequisite programs the learner
// has not completed. No-op when the cohort has no program or no prerequisites.
// Direct prerequisites only (one level).
const assertPrerequisitesMet = async (cohort, userId) => {
  if (!cohort?.programId) return;
  const program = await query(
    `SELECT prerequisite_programs FROM learning_programs WHERE id = $1`,
    [String(cohort.programId)],
  );
  const prereqIds = program.rows[0]?.prerequisite_programs || [];
  if (!prereqIds.length) return;

  const unmet = [];
  for (const prereqId of prereqIds) {
    // eslint-disable-next-line no-await-in-loop -- prerequisite lists are short
    const met = await hasCompletedProgram(userId, prereqId);
    if (!met) unmet.push(prereqId);
  }
  if (!unmet.length) return;

  const names = await query(
    `SELECT name FROM learning_programs WHERE id = ANY($1)`,
    [unmet.map(String)],
  );
  const labels = names.rows.map((p) => p.name).join(', ');
  throw new ServiceError(`Prerequisite not met: complete ${labels} first`, 422);
};

module.exports = { assertPrerequisitesMet, hasCompletedProgram, completedProgramUserIds };
