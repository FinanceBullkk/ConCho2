const mongoose = require('mongoose');
const Class = require('../../models/Class');
const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Enrollment = require('../../models/Enrollment');
const Evaluation = require('../../models/Evaluation');
const { getNextSequence } = require('../../helpers/counter');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const learningUseCases = require('../../domains/learning/use-cases');

// ──────────────────────────────────────────────────────────
// Class Controller — create/update/delete handlers
// ──────────────────────────────────────────────────────────
// Split from the legacy classController (Phase 1 modular-monolith).
// Create (auto classCode + LearningProgram backfill), update (re-map
// totalSessions + program on course change), delete (referential guards +
// cascade Evaluation/Enrollment cleanup in a transaction).

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
    const Setting = mongoose.model('Setting');
    const setting = await Setting.findOne({ key: 'COURSE_SESSIONS' });
    const courseSessions = setting ? setting.value : {};
    let totalSessions = courseSessions[courseName];
    let program = null;

    if (!totalSessions) {
      return res.status(400).json({ success: false, message: `Unknown course: ${courseName}` });
    }
    program = await learningUseCases.ensureProgramForLegacyCourse(courseName, totalSessions);

    // ── Rule: Only 1 Ongoing course per classCode ──────────
    const effectiveStatus = status || 'Ongoing';
    if (effectiveStatus === 'Ongoing') {
      const existingOngoing = await Class.findOne({
        classCode: classCode.toUpperCase(),
        status: 'Ongoing',
      });
      if (existingOngoing) {
        return res.status(409).json({
          success: false,
          message: `Class "${classCode.toUpperCase()}" already has an Ongoing course: "${existingOngoing.courseName}". Please mark it as Completed before starting a new course.`,
        });
      }
    }

    const cls = await Class.create({
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
    const existingCls = await Class.findById(req.params.id);
    if (!existingCls) return res.status(404).json({ success: false, message: 'Class not found' });

    // If courseName is being changed, recalculate totalSessions
    if (req.body.courseName && !req.body.totalSessions) {
      const Setting = mongoose.model('Setting');
      const setting = await Setting.findOne({ key: 'COURSE_SESSIONS' });
      if (setting && setting.value[req.body.courseName]) {
        req.body.totalSessions = setting.value[req.body.courseName];
        const program = await learningUseCases.ensureProgramForLegacyCourse(req.body.courseName, req.body.totalSessions);
        req.body.programId = program?._id || existingCls.programId || null;
      }
    }

    // ── Rule: Only 1 Ongoing course per classCode ──────────
    const newStatus = req.body.status || existingCls.status;
    if (newStatus === 'Ongoing' && existingCls.status !== 'Ongoing') {
      // Changing TO Ongoing — check for conflicts
      const conflict = await Class.findOne({
        _id: { $ne: existingCls._id },
        classCode: existingCls.classCode,
        status: 'Ongoing',
      });
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `Class "${existingCls.classCode}" already has an Ongoing course: "${conflict.courseName}". Mark it as Completed first.`,
        });
      }
    }

    const cls = await Class.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
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
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

    // Guard: check for Teams assigned to this class
    const teamCount = await Team.countDocuments({ classId: cls._id });
    if (teamCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${teamCount} team(s) are still assigned to this class. Delete or reassign them first.`,
      });
    }

    // Guard: check for Schedules referencing this class
    const scheduleCount = await Schedule.countDocuments({ classId: cls._id });
    if (scheduleCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${scheduleCount} schedule(s) still reference this class. Delete them first.`,
      });
    }

    // ── Cascade: cleanup referencing data before delete (DI-03) ──
    const session = await mongoose.startSession();
    let deletedEvaluations = 0;
    let deletedEnrollments = 0;
    try {
      await session.withTransaction(async () => {
        const evalResult = await Evaluation.deleteMany({ classId: cls._id }, { session });
        deletedEvaluations = evalResult.deletedCount;

        const enrollResult = await Enrollment.deleteMany({ classId: cls._id }, { session });
        deletedEnrollments = enrollResult.deletedCount;

        await Class.findByIdAndDelete(cls._id, { session });
      });
    } finally {
      session.endSession();
    }

    auditService.record({
      req,
      action: 'deleted',
      entity: 'Class',
      entityId: cls._id,
      note: `Cascade: ${deletedEvaluations} evaluations, ${deletedEnrollments} enrollments. Class: ${cls.classCode} - ${cls.courseName}`,
    });

    res.json({
      success: true,
      message: `Class ${cls.classCode} - ${cls.courseName} deleted`,
      cascade: { deletedEvaluations, deletedEnrollments },
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { createClass, updateClass, deleteClass };
