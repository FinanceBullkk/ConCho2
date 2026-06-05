const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');
const { assertTeacherCanAccessCohort } = require('./access');

const round2 = (n) => Math.round(n * 100) / 100;

const recalcAttempt = (answers, passingScorePercent) => {
  const score = answers.reduce((sum, answer) => sum + (answer.pointsEarned || 0), 0);
  const maxScore = answers.reduce((sum, answer) => sum + (answer.pointsPossible || 0), 0);
  const scorePercent = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  return {
    score,
    maxScore,
    scorePercent,
    passed: scorePercent >= (passingScorePercent || 0),
  };
};

const manualGradeAttempt = async (attemptId, body, actor) => {
  const attempt = await repository.findAttemptById(attemptId);
  if (!attempt) {
    throw new ServiceError('Assessment attempt not found', 404);
  }
  const assessment = await repository.findAssessmentById(attempt.assessmentId);
  if (!assessment) {
    throw new ServiceError('Assessment not found', 404);
  }
  const cohort = await repository.findCohort(assessment.cohortId);
  assertTeacherCanAccessCohort(actor, cohort, 'grade');

  const items = new Map(assessment.items.map((item) => [item._id.toString(), item]));
  const updates = new Map(body.answers.map((answer) => [answer.itemId.toString(), answer]));
  const reviewedAt = new Date();

  const answers = attempt.answers.map((answer) => {
    const update = updates.get(answer.itemId.toString());
    if (!update) return answer;

    const item = items.get(answer.itemId.toString());
    if (!item || item.type !== 'short_text') {
      throw new ServiceError('Only short_text answers can be manually graded', 422);
    }
    if (update.pointsEarned > answer.pointsPossible) {
      throw new ServiceError('Manual score cannot exceed item points', 422);
    }

    return {
      ...answer,
      pointsEarned: update.pointsEarned,
      correct: update.pointsEarned >= answer.pointsPossible && answer.pointsPossible > 0,
      manualPointsEarned: update.pointsEarned,
      manualCorrect: update.pointsEarned >= answer.pointsPossible && answer.pointsPossible > 0,
      manualNote: update.note || '',
      manualGradedBy: actor._id,
      manualGradedAt: reviewedAt,
    };
  });

  const found = new Set(attempt.answers.map((answer) => answer.itemId.toString()));
  if ([...updates.keys()].some((itemId) => !found.has(itemId))) {
    throw new ServiceError('Attempt answer not found for one or more items', 404);
  }

  return repository.updateAttemptGrade(attemptId, {
    answers,
    ...recalcAttempt(answers, assessment.passingScorePercent),
  });
};

module.exports = { manualGradeAttempt };
