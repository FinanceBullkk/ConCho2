const idOf = (value) => (value && value._id ? value._id : value) || null;

// Item shape. Correct answers (correctOptionIndexes / acceptedAnswers) are only
// included for managers — a learner taking the quiz must never receive them.
const itemDto = (item, includeAnswers) => {
  const base = {
    id: item._id,
    type: item.type,
    prompt: item.prompt,
    options: item.options,
    questionBankItemId: idOf(item.questionBankItemId),
    points: typeof item.points === 'number' ? item.points : 1,
  };
  if (includeAnswers) {
    base.correctOptionIndexes = item.correctOptionIndexes;
    base.acceptedAnswers = item.acceptedAnswers;
  }
  return base;
};

const assessmentDto = (a, { includeAnswers = false } = {}) => {
  if (!a) return null;
  const c = a.cohortId;
  const cohortPopulated = c && typeof c === 'object' && c.classCode !== undefined;
  return {
    id: a._id,
    title: a.title,
    description: a.description || '',
    cohortId: idOf(a.cohortId),
    cohortCode: cohortPopulated ? c.classCode : undefined,
    programId: idOf(a.programId),
    passingScorePercent: a.passingScorePercent || 0,
    maxAttempts: a.maxAttempts || 0,
    isPublished: Boolean(a.isPublished),
    itemCount: Array.isArray(a.items) ? a.items.length : 0,
    items: Array.isArray(a.items) ? a.items.map((i) => itemDto(i, includeAnswers)) : [],
    createdBy: idOf(a.createdBy),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
};

const answerDto = (answer, includeManualMetadata) => {
  const base = {
    itemId: answer.itemId,
    selectedOptionIndexes: answer.selectedOptionIndexes,
    text: answer.text,
    pointsEarned: answer.pointsEarned,
    pointsPossible: answer.pointsPossible,
    correct: answer.correct,
  };
  if (includeManualMetadata) {
    base.manualPointsEarned = answer.manualPointsEarned;
    base.manualCorrect = answer.manualCorrect;
    base.manualNote = answer.manualNote;
    base.manualGradedBy = idOf(answer.manualGradedBy);
    base.manualGradedAt = answer.manualGradedAt;
  }
  return base;
};

const attemptDto = (att, { includeManualMetadata = false } = {}) => {
  if (!att) return null;
  const u = att.userId;
  const userPopulated = u && typeof u === 'object' && u.name !== undefined;
  const a = att.assessmentId;
  const assessmentPopulated = a && typeof a === 'object' && a.title !== undefined;
  return {
    id: att._id,
    assessmentId: idOf(att.assessmentId),
    assessmentTitle: assessmentPopulated ? a.title : undefined,
    cohortId: idOf(att.cohortId),
    learner: {
      id: idOf(att.userId),
      name: userPopulated ? u.name : undefined,
      empCode: userPopulated ? u.empCode : undefined,
      department: userPopulated ? u.department : undefined,
    },
    score: att.score,
    maxScore: att.maxScore,
    scorePercent: att.scorePercent,
    passed: att.passed,
    answers: Array.isArray(att.answers)
      ? att.answers.map((answer) => answerDto(answer, includeManualMetadata))
      : [],
    submittedAt: att.submittedAt,
  };
};

module.exports = { assessmentDto, attemptDto };
