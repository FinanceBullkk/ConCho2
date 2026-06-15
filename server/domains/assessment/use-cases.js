const repository = require('./repository');
const { gradeAttempt } = require('./grading');
const { isCohortParticipant } = require('../../helpers/cohortMembership');
const { ServiceError } = require('../../helpers/ServiceError');
const { actorHasCapability, CAPABILITIES } = require('../../policy/capabilities');
const {
  assertTeacherCanAccessCohort,
  visibleCohortIdsForTeacher,
} = require('./access');

const canManage = (actor) => actorHasCapability(actor, CAPABILITIES.ASSESSMENT_MANAGE);

const itemFromBankQuestion = (question) => ({
  type: question.type,
  prompt: question.prompt,
  options: question.options,
  correctOptionIndexes: question.correctOptionIndexes,
  acceptedAnswers: question.acceptedAnswers,
  points: question.points,
  questionBankItemId: question._id,
});

const resolveItems = async (body) => {
  const authored = body.items || [];
  const bankIds = body.questionBankItemIds || [];
  if (!bankIds.length) {
    return authored;
  }

  const bankItems = await repository.findQuestionBankItemsByIds(bankIds);
  if (bankItems.length !== new Set(bankIds.map(String)).size) {
    throw new ServiceError('One or more question bank items were not found', 404);
  }
  const byId = new Map(bankItems.map((item) => [item._id.toString(), item]));
  return [
    ...authored,
    ...bankIds.map((id) => itemFromBankQuestion(byId.get(id.toString()))),
  ];
};

// Author a cohort assessment. Manager-only at the route; the cohort must exist.
const createAssessment = async (body, actor) => {
  const cohort = await repository.findCohort(body.cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }
  assertTeacherCanAccessCohort(actor, cohort, 'create');
  const items = await resolveItems(body);
  return repository.createAssessment({
    title: body.title,
    description: body.description || '',
    cohortId: body.cohortId,
    programId: cohort.programId || null,
    items,
    passingScorePercent: body.passingScorePercent ?? 0,
    maxAttempts: body.maxAttempts ?? 0,
    timeLimitMinutes: body.timeLimitMinutes ?? 0,
    shuffleQuestions: body.shuffleQuestions ?? false,
    showAnswersAfter: body.showAnswersAfter ?? false,
    isPublished: body.isPublished ?? false,
    createdBy: actor._id,
  });
};

// Update replaces the authored definition atomically. Attempts remain immutable;
// existing attempt scores are historical snapshots of the old definition.
const updateAssessment = async (id, body, actor) => {
  const before = await repository.findAssessmentById(id);
  if (!before) {
    throw new ServiceError('Assessment not found', 404);
  }
  const beforeCohort = await repository.findCohort(before.cohortId);
  if (!beforeCohort || beforeCohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }
  assertTeacherCanAccessCohort(actor, beforeCohort, 'update');

  const cohort = await repository.findCohort(body.cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }
  assertTeacherCanAccessCohort(actor, cohort, 'update');
  const items = await resolveItems(body);
  const after = await repository.updateAssessment(id, {
    title: body.title,
    description: body.description || '',
    cohortId: body.cohortId,
    programId: cohort.programId || null,
    items,
    passingScorePercent: body.passingScorePercent ?? 0,
    maxAttempts: body.maxAttempts ?? 0,
    timeLimitMinutes: body.timeLimitMinutes ?? 0,
    shuffleQuestions: body.shuffleQuestions ?? false,
    showAnswersAfter: body.showAnswersAfter ?? false,
    isPublished: body.isPublished ?? false,
  });
  return { before, after };
};

// Managers see every assessment; learners see only published ones.
const listAssessments = async (query, actor) => {
  if (actor?.role === 'Teacher') {
    if (query.cohortId) {
      const cohort = await repository.findCohort(query.cohortId);
      if (cohort && !cohort.isDeleted) {
        assertTeacherCanAccessCohort(actor, cohort, 'read');
      }
      return repository.listAssessments({ cohortId: query.cohortId, publishedOnly: false });
    }
    return repository.listAssessments({
      cohortIds: await visibleCohortIdsForTeacher(actor),
      publishedOnly: false,
    });
  }
  return repository.listAssessments({ cohortId: query.cohortId, publishedOnly: !canManage(actor) });
};

// Returns { assessment, includeAnswers }. Learners cannot see unpublished
// assessments, and never receive the correct-answer keys.
const getAssessment = async (id, actor) => {
  const assessment = await repository.findAssessmentById(id);
  if (!assessment) {
    throw new ServiceError('Assessment not found', 404);
  }
  const manage = canManage(actor);
  if (actor?.role === 'Teacher') {
    const cohort = await repository.findCohort(assessment.cohortId);
    assertTeacherCanAccessCohort(actor, cohort, 'read');
  }
  if (!manage && !assessment.isPublished) {
    throw new ServiceError('Assessment not found', 404);
  }
  return { assessment, includeAnswers: manage };
};

const archiveAssessment = async (id, actor) => {
  const before = await repository.findAssessmentById(id);
  if (!before) {
    throw new ServiceError('Assessment not found', 404);
  }
  const cohort = await repository.findCohort(before.cohortId);
  assertTeacherCanAccessCohort(actor, cohort, 'archive');
  const after = await repository.softDeleteAssessment(id);
  return { before, after };
};

// A learner submits answers; the attempt is auto-graded immediately. Attempts
// are always for the actor themselves (a grader does not take the quiz).
const submitAttempt = async (assessmentId, body, actor) => {
  const assessment = await repository.findAssessmentById(assessmentId);
  if (!assessment) {
    throw new ServiceError('Assessment not found', 404);
  }
  if (!assessment.isPublished) {
    throw new ServiceError('Assessment is not open for attempts', 422);
  }

  const participates = await isCohortParticipant(assessment.cohortId, actor._id);
  if (!participates) {
    throw new ServiceError('Learner is not a participant of this cohort', 403);
  }

  if (assessment.maxAttempts > 0) {
    const used = await repository.countAttempts(assessmentId, actor._id);
    if (used >= assessment.maxAttempts) {
      throw new ServiceError('Maximum attempts reached for this assessment', 409);
    }
  }

  const result = gradeAttempt(assessment, body.answers);
  return repository.createAttempt({
    assessmentId,
    userId: actor._id,
    cohortId: assessment.cohortId,
    answers: result.graded,
    score: result.score,
    maxScore: result.maxScore,
    scorePercent: result.scorePercent,
    passed: result.passed,
  });
};

// Managers list any attempts; a learner is scoped to their own.
const listAttempts = async (query, actor) => {
  const learnerId = canManage(actor) ? query.learnerId : actor._id.toString();
  if (actor?.role === 'Teacher') {
    if (query.cohortId) {
      const cohort = await repository.findCohort(query.cohortId);
      if (cohort && !cohort.isDeleted) {
        assertTeacherCanAccessCohort(actor, cohort, 'read');
      }
      return repository.listAttempts({
        cohortId: query.cohortId,
        assessmentId: query.assessmentId,
        learnerId,
      });
    }
    return repository.listAttempts({
      cohortIds: await visibleCohortIdsForTeacher(actor),
      assessmentId: query.assessmentId,
      learnerId,
    });
  }
  return repository.listAttempts({
    cohortId: query.cohortId,
    assessmentId: query.assessmentId,
    learnerId,
  });
};

// Self-scoped unified assessment results for the caller across all cohorts:
// learner-attempted quiz results + instructor-scored English evaluations — the
// single "assessment results" surface (rearchitecture Phase 1 convergence).
// ALWAYS the actor themselves (a learner's own transcript); managers/teachers
// use the cohort-scoped listAttempts / evaluation surfaces.
const getMyResults = async (actor) => {
  const learnerId = actor._id.toString();
  const [attempts, evaluations] = await Promise.all([
    repository.listAttempts({ learnerId }),
    repository.listEvaluationsForLearner(learnerId),
  ]);
  return { attempts, evaluations };
};

module.exports = {
  createAssessment,
  updateAssessment,
  listAssessments,
  getAssessment,
  archiveAssessment,
  submitAttempt,
  listAttempts,
  getMyResults,
};
