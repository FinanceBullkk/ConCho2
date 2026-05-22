const Evaluation = require('../models/Evaluation');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Evaluation Controller
// ──────────────────────────────────────────────────────────

/**
 * POST /api/evaluations
 * Create or update evaluation (upsert by classId + userId).
 *
 * BUG #3+#4 mitigation: We record `createdBy` so future teacher-of-record
 * scoping (or audit / dispute resolution) has the necessary anchor.
 * Updates by a *different* Teacher leave the original `createdBy` intact —
 * the audit log captures the modifier separately.
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

    const update = {
      level, grammarScore, vocabularyScore, pronunciationScore,
      fluencyScore, teacherComment,
    };
    // Only set createdBy on the initial insert — never overwrite the
    // original author on subsequent updates.
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
 *
 * BUG #3 mitigation: Teachers must scope their query to a single class.
 * The data model has no teacher↔class binding (no Class.teacherId field),
 * so we can't enforce that the Teacher actually teaches the class they
 * query — but requiring classId at minimum eliminates org-wide
 * enumeration of evaluations and forces an explicit, auditable scope.
 *
 * TODO (sprint follow-up): Introduce a Class.teacherIds field and gate
 * Teacher reads/writes by membership. Until then, the upsert/list endpoints
 * record `createdBy` for accountability.
 *
 * Participants are already scoped to their own userId by the route-level
 * middleware (SEC-IDOR-01).
 */
const getEvaluations = async (req, res) => {
  try {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.userId) filter.userId = req.query.userId;

    // Teacher must supply classId. Admins are unrestricted.
    if (req.user.role === 'Teacher' && !filter.classId) {
      return res.status(400).json({
        success: false,
        message: 'classId query parameter is required for this role',
      });
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
 *
 * BUG #4 mitigation: Without a teacher↔class binding model we can't fully
 * scope Teacher detail reads. We at minimum log every Teacher detail read
 * to the audit trail so forensic review can detect enumeration.
 */
const getEvaluationById = async (req, res) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id)
      .populate('classId', 'classCode courseName')
      .populate('userId', 'empCode name department');

    if (!evaluation) return res.status(404).json({ success: false, message: 'Evaluation not found' });

    if (req.user.role === 'Teacher') {
      auditService.record({
        req,
        action: 'read',
        entity: 'Evaluation',
        entityId: evaluation._id,
        note: 'Teacher detail read (no class-binding scope available)',
      });
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
