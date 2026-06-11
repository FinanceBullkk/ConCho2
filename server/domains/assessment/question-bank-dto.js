const idOf = (value) => (value && value._id ? value._id : value) || null;

const questionBankItemDto = (q, { includeAnswers = false } = {}) => {
  if (!q) return null;
  const base = {
    id: q._id,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    points: typeof q.points === 'number' ? q.points : 1,
    explanation: q.explanation || '',
    tags: q.tags || [],
    programId: idOf(q.programId),
    cohortId: idOf(q.cohortId),
    createdBy: idOf(q.createdBy),
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
  if (includeAnswers) {
    base.correctOptionIndexes = q.correctOptionIndexes;
    base.acceptedAnswers = q.acceptedAnswers;
  }
  return base;
};

module.exports = { questionBankItemDto };
