const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./question-bank-use-cases');
const { questionBankItemDto } = require('./question-bank-dto');

const createQuestion = async (req, res) => {
  try {
    const q = await useCases.createQuestion(req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'AssessmentQuestion',
      entityId: q._id,
      diff: { after: { type: q.type, prompt: q.prompt, tags: q.tags } },
      note: 'Assessment question bank item created',
    });
    res.status(201).json({ success: true, data: questionBankItemDto(q, { includeAnswers: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

const listQuestions = async (req, res) => {
  try {
    const items = await useCases.listQuestions(req.query);
    res.json({
      success: true,
      count: items.length,
      data: items.map((q) => questionBankItemDto(q, { includeAnswers: true })),
    });
  } catch (error) {
    handleError(res, error);
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { before, after } = await useCases.updateQuestion(req.params.id, req.body);
    auditService.record({
      req,
      action: 'updated',
      entity: 'AssessmentQuestion',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Assessment question bank item updated',
    });
    res.json({ success: true, data: questionBankItemDto(after, { includeAnswers: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveQuestion = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveQuestion(req.params.id);
    auditService.record({
      req,
      action: 'archived',
      entity: 'AssessmentQuestion',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Assessment question bank item archived',
    });
    res.json({ success: true, data: questionBankItemDto(after, { includeAnswers: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  createQuestion,
  listQuestions,
  updateQuestion,
  archiveQuestion,
};
