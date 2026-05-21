const Evaluation = require('../models/Evaluation');
const Class = require('../models/Class');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Evaluation Controller
// ──────────────────────────────────────────────────────────

const isTeacherOfClass = (cls, userId) =>
  (cls.teacherIds || []).some(id => id.toString() === userId.toString());

/**
 * POST /api/evaluations
 * Create or update evaluation (upsert by classId + userId).
 * Teachers may only write evaluations for classes they are assigned to.
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

    if (req.user.role === 'Teacher') {
      const cls = await Class.findById(classId).lean();
      if (!cls) {
        return res.status(404).json({ success: false, message: 'Class not found' });
      }
      if (!isTeacherOfClass(cls, req.user._id)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: you are not assigned as a teacher for this class',
        });
      }
    }

    const before = await Evaluation.findOne({ classId, userId }).lean();

    const update = {
      level, grammarScore, vocabularyScore, pronunciationScore,
      fluencyScore, teacherComment,
    };
    const setOnInsert = { createdBy: req.user._id };

    const evaluation = await Evaluation.findOneAndUpdate(
      { classId, userId },
      { $set: update, $setOnInsert: setOnInsert },
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
 * Teachers may only list evaluations for classes they are assigned to.
 */
const getEvaluations = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.userId) filter.userId = req.query.userId;

    if (req.user.role === 'Teacher') {
      if (!filter.classId) {
        return res.status(400).json({
          success: false,
          message: 'classId query parameter is required for this role',
        });
      }
      const cls = await Class.findById(filter.classId).lean();
      if (!cls) {
        return res.status(404).json({ success: false, message: 'Class not found' });
      }
      if (!isTeacherOfClass(cls, req.user._id)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: you are not assigned as a teacher for this class',
        });
      }
    }

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
 * Teachers may only fetch evaluations for classes they are assigned to.
 */
const getEvaluationById = async (req, res) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id)
      .populate('classId', 'classCode courseName teacherIds')
      .populate('userId', 'empCode name department');

    if (!evaluation) return res.status(404).json({ success: false, message: 'Evaluation not found' });

    if (req.user.role === 'Teacher') {
      const cls = evaluation.classId;
      if (!cls || !isTeacherOfClass(cls, req.user._id)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized: you are not assigned as a teacher for this class',
        });
      }
    }

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
