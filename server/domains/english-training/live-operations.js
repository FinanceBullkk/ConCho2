const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./live-repository.pg');
const evaluationRepository = require('../evaluation/repository.pg');
const { computeEligibility } = require('./live-eligibility');

const assertEnglishCohortAccess = (cohort, actor, { write = false } = {}) => {
  if (!cohort || cohort.category !== 'english' || !cohort.englishPolicySnapshot) {
    throw new ServiceError('Live English course run not found', 404);
  }
  if (['Admin', 'Coordinator'].includes(actor?.role)) return;
  if (actor?.role === 'Teacher') {
    const assigned = cohort.teacherIds.some((teacherId) => String(teacherId) === String(actor._id));
    if (assigned) return;
  }
  throw new ServiceError(
    write ? 'You cannot update this English course run' : 'You are not assigned to this English course run',
    403,
  );
};

const getCohortEligibility = async (cohortId, actor) => {
  const cohort = await repository.getCohortContext(cohortId);
  assertEnglishCohortAccess(cohort, actor);
  const [sessions, enrollments, attendance] = await Promise.all([
    repository.listCohortSessions(cohortId),
    repository.listCohortEnrollments(cohortId),
    repository.listAttendanceForCohort(cohortId),
  ]);
  const marksByUser = new Map();
  for (const mark of attendance) {
    if (!marksByUser.has(mark.userId)) marksByUser.set(mark.userId, []);
    marksByUser.get(mark.userId).push(mark);
  }
  return {
    cohort,
    sessions,
    learners: enrollments.map((enrollment) => ({
      ...enrollment,
      eligibility: computeEligibility({
        policy: cohort.englishPolicySnapshot,
        cohortStatus: cohort.status,
        startSessionNumber: enrollment.startSessionNumber,
        sessions,
        marks: marksByUser.get(enrollment.userId) || [],
      }),
    })),
  };
};

const getEvaluationWorklist = async (cohortId, actor) => {
  const worklist = await getCohortEligibility(cohortId, actor);
  const evaluations = await evaluationRepository.listEnglishLevelsForCohort(cohortId);
  const byUser = new Map(evaluations.map((result) => [String(result.userId), result]));
  return {
    ...worklist,
    levels: worklist.cohort.englishPolicySnapshot.levelScale,
    learners: worklist.learners.map((learner) => ({
      ...learner,
      evaluation: byUser.get(String(learner.userId)) || null,
    })),
  };
};

const recordEnglishLevel = async ({ cohortId, userId, levelCode, evaluatedAt, note }, actor) => {
  const worklist = await getCohortEligibility(cohortId, actor);
  assertEnglishCohortAccess(worklist.cohort, actor, { write: true });
  const learner = worklist.learners.find((row) => String(row.userId) === String(userId));
  if (!learner) throw new ServiceError('Learner is not enrolled in this English course run', 404);
  if (learner.eligibility.status !== 'eligible') {
    throw new ServiceError('A final level can only be recorded after attendance is complete and the learner is eligible', 422);
  }
  const level = worklist.cohort.englishPolicySnapshot.levelScale
    .find((candidate) => candidate.code === levelCode);
  if (!level) throw new ServiceError('Level is not part of this course run policy snapshot', 400);
  const before = (await evaluationRepository.listEnglishLevelsForCohort(cohortId))
    .find((result) => String(result.userId) === String(userId)) || null;
  const result = await evaluationRepository.upsertEnglishLevel(cohortId, userId, {
    levelCode: level.code,
    displayName: level.displayName,
    note,
    evaluatedAt: evaluatedAt || new Date(),
    evaluatedBy: actor._id,
  });
  return { before, result };
};

const deleteEnglishLevel = async (evaluationId, actor) => {
  const evaluation = await evaluationRepository.findEnglishLevelById(evaluationId);
  if (!evaluation) throw new ServiceError('English level result not found', 404);
  const cohort = await repository.getCohortContext(evaluation.classId);
  assertEnglishCohortAccess(cohort, actor, { write: true });
  const deleted = await evaluationRepository.softDeleteById(evaluationId);
  return deleted;
};

module.exports = {
  assertEnglishCohortAccess,
  getCohortEligibility,
  getEvaluationWorklist,
  recordEnglishLevel,
  deleteEnglishLevel,
};
