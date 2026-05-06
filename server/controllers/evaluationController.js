const Evaluation = require('../models/Evaluation');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Evaluation Controller
// ──────────────────────────────────────────────────────────

/**
 * POST /api/evaluations
 * Create or update evaluation (upsert by classId + userId)
 */
const upsertEvaluation = async (req, res) => {
  try {
    const { classId, userId, level, grammarScore, vocabularyScore,
      pronunciationScore, fluencyScore, teacherComment } = req.body;

    if (!classId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'classId and userId are required',
      });
    }

    const before = await Evaluation.findOne({ classId, userId }).lean();

    const evaluation = await Evaluation.findOneAndUpdate(
      { classId, userId },
      { level, grammarScore, vocabularyScore, pronunciationScore,
        fluencyScore, teacherComment },
      { new: true, upsert: true, runValidators: true }
    );

    auditService.record({
      req,
      action: before ? 'updated' : 'created',
      entity: 'Evaluation',
      entityId: evaluation._id,
      diff: before
        ? auditService.diff(before, evaluation.toObject())
        : { after: { classId, userId, level, grammarScore, vocabularyScore, pronunciationScore, fluencyScore } },
    });

    res.json({ success: true, data: evaluation });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/evaluations
 * Query: ?classId=&userId=
 */
const getEvaluations = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.userId) filter.userId = req.query.userId;

    const evaluations = await Evaluation.find(filter)
      .populate('classId', 'classCode courseName')
      .populate('userId', 'empCode name department')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: evaluations.length, data: evaluations });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/evaluations/:id
 */
const getEvaluationById = async (req, res) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id)
      .populate('classId', 'classCode courseName')
      .populate('userId', 'empCode name department');

    if (!evaluation) return res.status(404).json({ success: false, message: 'Evaluation not found' });
    res.json({ success: true, data: evaluation });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /api/evaluations/:id
 */
const deleteEvaluation = async (req, res) => {
  try {
    const evaluation = await Evaluation.findByIdAndDelete(req.params.id);
    if (!evaluation) return res.status(404).json({ success: false, message: 'Evaluation not found' });

    auditService.record({
      req,
      action: 'deleted',
      entity: 'Evaluation',
      entityId: evaluation._id,
      diff: { before: evaluation.toObject() },
    });

    res.json({ success: true, message: 'Evaluation deleted' });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { upsertEvaluation, getEvaluations, getEvaluationById, deleteEvaluation };
