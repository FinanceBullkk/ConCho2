const LearningProgram = require('../../../models/LearningProgram');
const Class = require('../../../models/Class');
const Enrollment = require('../../../models/Enrollment');
const Schedule = require('../../../models/Schedule');
const Certificate = require('../../../models/Certificate');
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
  const cert = await Certificate.exists({
    userId, programId, status: 'Issued', isDeleted: false,
  });
  if (cert) return true;

  const cohortIds = await Class.find({ programId, isDeleted: { $ne: true } }).distinct('_id');
  if (!cohortIds.length) return false;

  const [enrolled, rostered] = await Promise.all([
    Enrollment.find({
      userId, classId: { $in: cohortIds }, status: { $in: PARTICIPATING_STATUSES },
    }).distinct('classId'),
    Schedule.find({ classId: { $in: cohortIds }, enrolledUsers: userId, status: 'scheduled' }).distinct('classId'),
  ]);

  const participated = [...new Set([...enrolled, ...rostered].map(String))];
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
  const certUserIds = await Certificate.find({
    userId: { $in: ids }, programId, status: 'Issued', isDeleted: false,
  }).distinct('userId');
  certUserIds.forEach((id) => complete.add(String(id)));

  const remaining = ids.filter((id) => !complete.has(String(id)));
  if (!remaining.length) return complete;

  const cohortIds = await Class.find({ programId, isDeleted: { $ne: true } }).distinct('_id');
  if (!cohortIds.length) return complete;

  // Participation discovery (batched): enrolled OR session-rostered — the same
  // two signals the per-user path uses, across all remaining learners at once.
  const [enrolledRows, rosteredRows] = await Promise.all([
    Enrollment.find({
      userId: { $in: remaining }, classId: { $in: cohortIds }, status: { $in: PARTICIPATING_STATUSES },
    }).select('userId classId').lean(),
    Schedule.find({
      classId: { $in: cohortIds }, enrolledUsers: { $in: remaining }, status: 'scheduled',
    }).select('classId enrolledUsers').lean(),
  ]);

  const remainingSet = new Set(remaining.map(String));
  const cohortsByUser = new Map(); // String(userId) -> Set<String(cohortId)>
  const addParticipation = (userId, classId) => {
    const u = String(userId);
    if (!cohortsByUser.has(u)) cohortsByUser.set(u, new Set());
    cohortsByUser.get(u).add(String(classId));
  };
  enrolledRows.forEach((row) => addParticipation(row.userId, row.classId));
  rosteredRows.forEach((row) => {
    (row.enrolledUsers || []).forEach((u) => {
      if (remainingSet.has(String(u))) addParticipation(u, row.classId);
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
  const program = await LearningProgram.findById(cohort.programId)
    .select('prerequisitePrograms')
    .lean();
  const prereqIds = program?.prerequisitePrograms || [];
  if (!prereqIds.length) return;

  const unmet = [];
  for (const prereqId of prereqIds) {
    // eslint-disable-next-line no-await-in-loop -- prerequisite lists are short
    const met = await hasCompletedProgram(userId, prereqId);
    if (!met) unmet.push(prereqId);
  }
  if (!unmet.length) return;

  const names = await LearningProgram.find({ _id: { $in: unmet } }).select('name').lean();
  const labels = names.map((p) => p.name).join(', ');
  throw new ServiceError(`Prerequisite not met: complete ${labels} first`, 422);
};

module.exports = { assertPrerequisitesMet, hasCompletedProgram, completedProgramUserIds };
