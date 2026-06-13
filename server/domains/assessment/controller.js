const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');
const manualGradingUseCases = require('./manual-grading-use-cases');
const { assessmentDto, attemptDto, attemptResultDto, evaluationResultDto } = require('./dto');

const createAssessment = async (req, res) => {
  try {
    const a = await useCases.createAssessment(req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'Assessment',
      entityId: a._id,
      diff: { after: { title: a.title, cohortId: a.cohortId, itemCount: a.items.length } },
      note: 'Assessment created',
    });
    res.status(201).json({ success: true, data: assessmentDto(a, { includeAnswers: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

const listAssessments = async (req, res) => {
  try {
    const items = await useCases.listAssessments(req.query, req.user);
    const includeAnswers = req.user.role === 'Admin' || req.user.role === 'Teacher';
    res.json({
      success: true,
      count: items.length,
      data: items.map((a) => assessmentDto(a, { includeAnswers })),
    });
  } catch (error) {
    handleError(res, error);
  }
};

const updateAssessment = async (req, res) => {
  try {
    const { before, after } = await useCases.updateAssessment(req.params.id, req.body, req.user);
    auditService.record({
      req,
      action: 'updated',
      entity: 'Assessment',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Assessment updated',
    });
    res.json({ success: true, data: assessmentDto(after, { includeAnswers: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

const getAssessment = async (req, res) => {
  try {
    const { assessment, includeAnswers } = await useCases.getAssessment(req.params.id, req.user);
    res.json({ success: true, data: assessmentDto(assessment, { includeAnswers }) });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveAssessment = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveAssessment(req.params.id, req.user);
    auditService.record({
      req,
      action: 'archived',
      entity: 'Assessment',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Assessment archived (soft delete)',
    });
    res.json({ success: true, data: assessmentDto(after, { includeAnswers: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

const submitAttempt = async (req, res) => {
  try {
    const attempt = await useCases.submitAttempt(req.params.id, req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'AssessmentAttempt',
      entityId: attempt._id,
      diff: { after: { assessmentId: attempt.assessmentId, scorePercent: attempt.scorePercent, passed: attempt.passed } },
      note: 'Assessment attempt submitted',
    });
    res.status(201).json({ success: true, data: attemptDto(attempt) });
  } catch (error) {
    handleError(res, error);
  }
};

const listAttempts = async (req, res) => {
  try {
    const attempts = await useCases.listAttempts(req.query, req.user);
    const includeManualMetadata = req.user.role === 'Admin' || req.user.role === 'Teacher';
    res.json({
      success: true,
      count: attempts.length,
      data: attempts.map((attempt) => attemptDto(attempt, { includeManualMetadata })),
    });
  } catch (error) {
    handleError(res, error);
  }
};

const manualGradeAttempt = async (req, res) => {
  try {
    const attempt = await manualGradingUseCases.manualGradeAttempt(req.params.id, req.body, req.user);
    auditService.record({
      req,
      action: 'updated',
      entity: 'AssessmentAttempt',
      entityId: req.params.id,
      diff: { after: { scorePercent: attempt.scorePercent, passed: attempt.passed } },
      note: 'Assessment attempt manually graded',
    });
    res.json({ success: true, data: attemptDto(attempt, { includeManualMetadata: true }) });
  } catch (error) {
    handleError(res, error);
  }
};

// GET /assessment/results/mine — the caller's unified assessment results
// (quiz attempts + instructor-scored English evaluations) in ONE shape, newest
// first. Self-scoped read; read-only → not audited.
const getMyResults = async (req, res) => {
  try {
    const { attempts, evaluations } = await useCases.getMyResults(req.user);
    const results = [
      ...attempts.map(attemptResultDto),
      ...evaluations.map(evaluationResultDto),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  createAssessment,
  listAssessments,
  updateAssessment,
  getAssessment,
  archiveAssessment,
  submitAttempt,
  listAttempts,
  manualGradeAttempt,
  getMyResults,
};
