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
    timeLimitMinutes: a.timeLimitMinutes || 0,
    shuffleQuestions: Boolean(a.shuffleQuestions),
    showAnswersAfter: Boolean(a.showAnswersAfter),
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

// ── Unified assessment result (rearchitecture Phase 1 convergence) ─────────
// ONE shape for BOTH assessment modes — a learner-attempted quiz result and an
// instructor-scored English evaluation — so the transcript/reporting read a
// single "assessment results" list regardless of how the result was produced.
const round2 = (n) => Math.round(n * 100) / 100;

const attemptResultDto = (a) => ({
  source: 'quiz',
  id: String(a._id),
  cohortId: a.cohortId ? String(a.cohortId._id || a.cohortId) : null,
  title: (a.assessmentId && a.assessmentId.title) || 'Quiz',
  scorePercent: typeof a.scorePercent === 'number' ? a.scorePercent : 0,
  passed: Boolean(a.passed),
  date: a.submittedAt || a.createdAt || null,
});

const evaluationResultDto = (e) => {
  const avg = round2(
    ((e.grammarScore || 0) + (e.vocabularyScore || 0)
      + (e.pronunciationScore || 0) + (e.fluencyScore || 0)) / 4,
  );
  const cohort = e.classId && typeof e.classId === 'object' ? e.classId : null;
  return {
    source: 'evaluation',
    id: String(e._id),
    cohortId: cohort ? String(cohort._id) : (e.classId ? String(e.classId) : null),
    title: cohort && cohort.courseName ? `${cohort.courseName} — evaluation` : 'English evaluation',
    scorePercent: round2(avg * 10), // 4-skill average (0–10) → percent
    averageScore: avg,
    level: e.level || '',
    passed: true, // an instructor-recorded evaluation is a completed result
    date: e.updatedAt || e.createdAt || null,
  };
};

// ── Grading queue (convergence Phase 4 — slice C1) ─────────
// ONE shape for the staff grading workspace: gradable units across both modes.
// Each carries `mode` + the identifier its native entry modal needs (assessment
// id for quiz → ManualGradingModal; classId for rubric → the evaluation entry).
const gradingQueueDto = ({ assessments = [], attemptCounts = [], classes = [], evalCounts = [] }) => {
  const attemptMap = new Map(attemptCounts.map((a) => [String(a._id), a.count]));
  const evalMap = new Map(evalCounts.map((e) => [String(e._id), e.count]));
  return {
    quiz: assessments.map((a) => {
      const c = a.cohortId;
      const pop = c && typeof c === 'object' && c.classCode !== undefined;
      return {
        mode: 'quiz',
        id: String(a._id),
        title: a.title,
        cohortId: pop ? String(c._id) : (a.cohortId ? String(a.cohortId) : null),
        cohortCode: pop ? c.classCode : undefined,
        attemptCount: attemptMap.get(String(a._id)) || 0,
      };
    }),
    rubric: classes.map((c) => ({
      mode: 'rubric',
      classId: String(c._id),
      classCode: c.classCode,
      courseName: c.courseName,
      status: c.status,
      evaluatedCount: evalMap.get(String(c._id)) || 0,
    })),
  };
};

module.exports = {
  assessmentDto,
  attemptDto,
  attemptResultDto,
  evaluationResultDto,
  gradingQueueDto,
};
