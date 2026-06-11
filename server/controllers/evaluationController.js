const Evaluation = require('../models/Evaluation');
const Class = require('../models/Class');
const Enrollment = require('../models/Enrollment');
const auditService = require('../services/auditService');
const evaluationPolicy = require('../policy/evaluation');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Evaluation Controller
// ──────────────────────────────────────────────────────────

const policyDeny = (res, decision) =>
  res.status(403).json({
    success: false,
    message: 'You are not permitted to access this evaluation',
    reason: decision.reason,
  });

/**
 * POST /api/evaluations
 * Create or update evaluation (upsert by classId + userId).
 *
 * Audit PR 5 (AUTHZ-001): writes now go through policy.canWrite, which
 * checks the actor is bound to the class via Class.teacherIds. When a
 * class has empty teacherIds (legacy data) the policy is permissive —
 * this preserves the existing behaviour during the migration window.
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

    // Audit PR 5: per-class teacher binding check.
    const cls = await Class.findById(classId).lean();
    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    const decision = evaluationPolicy.canWrite(req.user, cls);
    if (!decision.allowed) return policyDeny(res, decision);

    // Look up INCLUDING trashed rows (explicit isDeleted skips the soft-delete
    // hook): the {classId,userId} unique index is full, so a re-evaluation
    // after a soft delete must REVIVE the trashed row in place — an upsert
    // insert would E11000 against it (DATA-014, audit round 2).
    // `null` in the $in matches legacy rows that PREDATE the isDeleted field
    // (missing field) — without it the upsert would try to insert and E11000
    // against the existing legacy row.
    const before = await Evaluation.findOne({
      classId, userId, isDeleted: { $in: [true, false, null] },
    }).lean();
    const reviving = Boolean(before?.isDeleted);

    const update = {
      level, grammarScore, vocabularyScore, pronunciationScore,
      fluencyScore, teacherComment,
      ...(reviving ? { isDeleted: false, deletedAt: null } : {}),
    };
    // Only set createdBy on the initial insert — never overwrite the
    // original author on subsequent updates.
    const setOnInsert = { createdBy: req.user._id };

    const evaluation = await Evaluation.findOneAndUpdate(
      // Explicit isDeleted match lets the update reach a trashed row too
      // (and `null` covers legacy rows missing the field — see above).
      { classId, userId, isDeleted: { $in: [true, false, null] } },
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
      ...(reviving ? { note: 'Revived a soft-deleted evaluation by re-upsert' } : {}),
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
 * Audit PR 5 (AUTHZ-001): Teacher reads now require Class.teacherIds
 * membership (per-class binding). When teacherIds is empty (legacy /
 * not-yet-configured class) the policy is permissive — same behaviour as
 * before. When teacherIds is populated, only bound teachers can list
 * evaluations for that class.
 *
 * Teachers must still supply classId at minimum — eliminates org-wide
 * enumeration of evaluations and forces an explicit, auditable scope.
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

    // Audit PR 5: if the request scopes to a single class AND the actor
    // is a Teacher, gate by teacherIds binding.
    if (req.user.role === 'Teacher' && filter.classId) {
      const cls = await Class.findById(filter.classId).lean();
      if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
      const decision = evaluationPolicy.canRead(req.user, cls);
      if (!decision.allowed) return policyDeny(res, decision);
    }

    const evaluations = await Evaluation.find(filter)
      .populate('classId', 'classCode courseName')
      .populate('userId', 'empCode name department');

    // Sort separately so we don't need to specify both indexes
    evaluations.sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, count: evaluations.length, data: evaluations });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/evaluations/:id
 *
 * Audit PR 5 (AUTHZ-001): Teacher detail reads now respect the per-class
 * binding policy. When teacherIds is empty the policy is permissive (legacy
 * behaviour); when populated, only bound teachers can read evaluations
 * belonging to that class. Either way the read is still audit-logged.
 */
const getEvaluationById = async (req, res) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id)
      .populate('classId', 'classCode courseName')
      .populate('userId', 'empCode name department');

    if (!evaluation) return res.status(404).json({ success: false, message: 'Evaluation not found' });

    if (req.user.role === 'Teacher') {
      // The populated classId may be the doc or the id depending on whether
      // populate matched — fetch a lean doc explicitly for the policy check.
      const cls = await Class.findById(evaluation.classId._id || evaluation.classId).lean();
      const decision = evaluationPolicy.canRead(req.user, cls, evaluation.toObject ? evaluation.toObject() : evaluation);
      if (!decision.allowed) return policyDeny(res, decision);

      auditService.record({
        req,
        action: 'read',
        entity: 'Evaluation',
        entityId: evaluation._id,
        note: `Teacher detail read (policy: ${decision.reason})`,
      });
    }

    res.json({ success: true, data: evaluation });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/evaluations/roster?classId=
 *
 * FLOW-001 (audit round 3): the Add-evaluation learner picker used the
 * org-wide /api/users search, which is Admin-only — so a Teacher (who CAN
 * write evaluations per roleGuard + route-permission-matrix) could never
 * select a learner and the grading flow was a dead end. This returns the
 * class-scoped roster (Active enrollments) instead: least-privilege (a
 * teacher picks from the class they teach, never the org directory) and
 * gated by the same per-class binding policy as evaluation reads.
 */
const getEvaluationRoster = async (req, res) => {
  try {
    const { classId } = req.query;

    const cls = await Class.findById(classId).lean();
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

    // Same per-class binding as getEvaluations: a bound Teacher may read the
    // roster; empty teacherIds stays permissive (legacy migration window).
    if (req.user.role === 'Teacher') {
      const decision = evaluationPolicy.canRead(req.user, cls);
      if (!decision.allowed) return policyDeny(res, decision);
    }

    // Active enrollments for the class → the learners eligible to be graded.
    // populate('userId') is hook-filtered, so trashed users yield null and are
    // dropped. Dedupe by user (a user could in theory have >1 enrollment row).
    const enrollments = await Enrollment.find({ classId, status: 'Active' })
      .populate('userId', 'empCode name department')
      .lean();

    const seen = new Set();
    const learners = [];
    for (const enr of enrollments) {
      const u = enr.userId;
      if (!u || !u._id) continue;
      const id = String(u._id);
      if (seen.has(id)) continue;
      seen.add(id);
      learners.push({ _id: u._id, empCode: u.empCode, name: u.name, department: u.department });
    }
    learners.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({ success: true, count: learners.length, data: learners });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /api/evaluations/:id
 * Admin-only (per evaluationRoutes.js).
 */
const deleteEvaluation = async (req, res) => {
  try {
    // SOFT delete (DATA-014, audit round 2) — golden rule: evaluation data is
    // never hard-deleted. The soft-delete hook scopes this to live rows, so a
    // second delete answers 404. Recoverable: re-upsert revives the row.
    const evaluation = await Evaluation.findByIdAndUpdate(
      req.params.id,
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
    if (!evaluation) return res.status(404).json({ success: false, message: 'Evaluation not found' });

    auditService.record({
      req,
      action: 'deleted',
      entity: 'Evaluation',
      entityId: evaluation._id,
      diff: { before: evaluation.toObject() },
      note: 'Soft-deleted (recoverable — re-upsert revives)',
    });

    res.json({ success: true, message: 'Evaluation deleted' });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { upsertEvaluation, getEvaluations, getEvaluationRoster, getEvaluationById, deleteEvaluation };
