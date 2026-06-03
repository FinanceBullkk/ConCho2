const repository = require('./question-bank-repository');
const { ServiceError } = require('../../helpers/ServiceError');

const normalizeQuestionData = (body, { actor = null, includeCreator = false } = {}) => ({
  type: body.type,
  prompt: body.prompt,
  options: body.options,
  correctOptionIndexes: body.correctOptionIndexes,
  acceptedAnswers: body.acceptedAnswers,
  points: body.points ?? 1,
  explanation: body.explanation || '',
  tags: body.tags || [],
  programId: body.programId || null,
  cohortId: body.cohortId || null,
  ...(includeCreator ? { createdBy: actor?._id || null } : {}),
});

const createQuestion = (body, actor) =>
  repository.createQuestion(normalizeQuestionData(body, { actor, includeCreator: true }));

const listQuestions = (query) => repository.listQuestions(query);

const updateQuestion = async (id, body) => {
  const before = await repository.findQuestionById(id);
  if (!before) {
    throw new ServiceError('Question bank item not found', 404);
  }
  const after = await repository.updateQuestion(id, normalizeQuestionData(body));
  return { before, after };
};

const archiveQuestion = async (id) => {
  const before = await repository.findQuestionById(id);
  if (!before) {
    throw new ServiceError('Question bank item not found', 404);
  }
  const after = await repository.softDeleteQuestion(id);
  return { before, after };
};

module.exports = {
  createQuestion,
  listQuestions,
  updateQuestion,
  archiveQuestion,
};
