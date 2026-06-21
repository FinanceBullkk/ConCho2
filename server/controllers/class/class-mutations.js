const { getNextSequence } = require('../../helpers/counter');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const learningUseCases = require('../../domains/learning/use-cases');
const repository = require('./class-repository');

// ──────────────────────────────────────────────────────────
// Class Controller — create/update/delete handlers
// ──────────────────────────────────────────────────────────
// Split from the legacy classController (Phase 1 modular-monolith).
// Create (auto classCode + LearningProgram backfill), update (re-map
// totalSessions + program on course change), delete (delegates to the domain
// cohort-delete use-case: referential guards + soft-archive, preserving
// evaluations + enrollment history per the golden rule).

/**
 * POST /api/classes
 *
 * classCode can be:
 *   - Provided explicitly (e.g. "EL001" for adding a course to existing cohort)
 *   - Omitted → auto-generate next code (e.g. "EL002" for new cohort)
 *
 * totalSessions is auto-mapped from courseName.
 */
const createClass = async (req, res) => {
  try {
    let { classCode, courseName, status } = req.body;

    // Auto-generate classCode if not provided
    if (!classCode) {
      const seq = await getNextSequence('classCode');
      classCode = `EL${seq.toString().padStart(3, '0')}`;
    }

    // Auto-map totalSessions from courseName
    const courseSessions = await repository.courseSessionsMap();
    let totalSessions = courseSessions[courseName];
    let program = null;

    if (!totalSessions) {
      return res.status(400).json({ success: false, message: `Unknown course: ${courseName}` });
    }
    program = await learningUseCases.ensureProgramForLegacyCourse(courseName, totalSessions);

    // ── Rule: Only 1 Ongoing course per classCode ──────────
    const effectiveStatus = status || 'Ongoing';
    if (effectiveStatus === 'Ongoing') {
      const existingOngoing = await repository.findOngoingByClassCode(classCode.toUpperCase());
      if (existingOngoing) {
        return res.status(409).json({
          success: false,
          message: `Class "${classCode.toUpperCase()}" already has an Ongoing course: "${existingOngoing.courseName}". Please mark it as Completed before starting a new course.`,
        });
      }
    }

    const cls = await repository.createClassDoc({
      classCode: classCode.toUpperCase(),
      courseName,
      programId: program?._id || null,
      totalSessions,
      status,
    });

    auditService.record({
      req,
      action: 'created',
      entity: 'Class',
      entityId: cls._id,
      diff: { after: { classCode: cls.classCode, courseName: cls.courseName, status: cls.status, totalSessions: cls.totalSessions } },
    });

    res.status(201).json({ success: true, data: cls });
  } catch (error) {
    // Handle duplicate key (classCode + courseName)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: `Class "${req.body.classCode}" already has course "${req.body.courseName}".`,
      });
    }
    handleError(res, error);
  }
};

/**
 * PUT /api/classes/:id
 */
const updateClass = async (req, res) => {
  try {
    const existingCls = await repository.findClassDocById(req.params.id);
    if (!existingCls) return res.status(404).json({ success: false, message: 'Class not found' });

    // If courseName is being changed, recalculate totalSessions
    if (req.body.courseName && !req.body.totalSessions) {
      const courseSessions = await repository.courseSessionsMap();
      if (courseSessions[req.body.courseName]) {
        req.body.totalSessions = courseSessions[req.body.courseName];
        const program = await learningUseCases.ensureProgramForLegacyCourse(req.body.courseName, req.body.totalSessions);
        req.body.programId = program?._id || existingCls.programId || null;
      }
    }

    // ── Rule: Only 1 Ongoing course per classCode ──────────
    const newStatus = req.body.status || existingCls.status;
    if (newStatus === 'Ongoing' && existingCls.status !== 'Ongoing') {
      // Changing TO Ongoing — check for conflicts
      const conflict = await repository.findOngoingByClassCode(existingCls.classCode, existingCls._id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `Class "${existingCls.classCode}" already has an Ongoing course: "${conflict.courseName}". Mark it as Completed first.`,
        });
      }
    }

    const cls = await repository.updateClassById(req.params.id, req.body);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

    auditService.record({
      req,
      action: 'updated',
      entity: 'Class',
      entityId: cls._id,
      diff: auditService.diff(existingCls.toObject(), cls.toObject()),
    });

    res.json({ success: true, data: cls });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /api/classes/:id
 * Delete a class — GUARD: blocks if Teams or Schedules still reference it.
 *
 * Admin must delete/reassign Teams and Schedules first to avoid
 * creating orphan data throughout the system.
 */
const deleteClass = async (req, res) => {
  try {
    // Delegate to the domain cohort-delete use-case (the /api/learning/cohorts
    // path). It applies the SAME team/schedule referential guards (409), then
    // SOFT-archives the Class and closes active enrollments to 'Dropped' while
    // PRESERVING evaluations + enrollment history (golden rule; recoverable via
    // cohort restore). This replaces the legacy hard-delete cascade that
    // hard-deleted Evaluations + Enrollments — an industry-audit P1 (data loss +
    // "never hard-delete evaluation data" violation), and divergent from the
    // already-correct domain path.
    const result = await learningUseCases.deleteCohort(req.params.id);

    auditService.record({
      req,
      action: 'deleted',
      entity: 'Class',
      entityId: req.params.id,
      note: `Soft-archived ${result.cohortCode} - ${result.courseName}; closed ${result.closedEnrollments} enrollment(s); evaluations preserved.`,
    });

    res.json({
      success: true,
      message: `Class ${result.cohortCode} - ${result.courseName} archived`,
      cascade: { closedEnrollments: result.closedEnrollments, evaluationsPreserved: true },
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { createClass, updateClass, deleteClass };
