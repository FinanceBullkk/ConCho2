const mongoose = require('mongoose');
const Class = require('../../models/Class');
const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Enrollment = require('../../models/Enrollment');
const classPolicy = require('../../policy/class');
const { handleError } = require('../../helpers/handleError');
const learningUseCases = require('../../domains/learning/use-cases');

// ──────────────────────────────────────────────────────────
// Class Controller — read handlers
// ──────────────────────────────────────────────────────────
// Split from the legacy classController (Phase 1 modular-monolith).
// Matrix list (with booked-session counts), course catalogue, and per-id
// read (Participant gated by enrollment via classPolicy.canRead).

/**
 * GET /api/classes
 *
 * Returns classes grouped by classCode for the matrix view.
 * Each class also includes `bookedSessions` (count of schedules).
 */
const getClasses = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.classCode) filter.classCode = req.query.classCode;

    const classes = await Class.find(filter).sort({ classCode: 1, courseName: 1 }).lean();

    // Batch-count booked sessions per class (1 aggregation)
    const classIds = classes.map(c => c._id);
    const sessionCounts = await Schedule.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: '$classId', bookedSessions: { $sum: 1 } } },
    ]);
    const countMap = {};
    sessionCounts.forEach(s => { countMap[s._id.toString()] = s.bookedSessions; });

    // Attach bookedSessions to each class
    const enriched = classes.map(c => ({
      ...c,
      bookedSessions: countMap[c._id.toString()] || 0,
    }));

    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/classes/courses
 * Returns the list of valid course names and their default sessions.
 */
const getCourseList = async (req, res) => {
  try {
    const programs = await learningUseCases.listPrograms({ status: 'active' });
    if (programs.length > 0) {
      const courseSessions = {};
      programs.forEach((program) => {
        courseSessions[program.name] = program.defaultSessionCount;
      });
      return res.json({
        success: true,
        data: {
          courseNames: programs.map((program) => program.name),
          courseSessions,
          programs,
          source: 'learning-programs',
        },
      });
    }

    const Setting = mongoose.model('Setting');
    const setting = await Setting.findOne({ key: 'COURSE_SESSIONS' });
    const courseSessions = setting ? setting.value : {};
    const courseNames = Object.keys(courseSessions);

    res.json({
      success: true,
      data: { courseNames, courseSessions, programs: [], source: 'settings' },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/classes/:id
 *
 * Audit PR M (AUTHZ-004): Participant must be enrolled in this class to
 * read its detail. Admin always allowed; Teacher follows the same
 * teacherIds binding used by evaluation/attendance/schedule policies.
 */
const getClassById = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id).lean();
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

    // Per-user gate. For Participant we look up enrollment existence.
    let participantEnrollmentExists = false;
    if (req.user?.role === 'Participant') {
      const teamIds = await Team.find({
        classId: cls._id,
        isDeleted: { $ne: true },
      }).distinct('_id');
      if (teamIds.length > 0) {
        participantEnrollmentExists = !!(await Enrollment.exists({
          userId: req.user._id,
          teamId: { $in: teamIds },
        }));
      }
    }

    const policy = classPolicy.canRead(req.user, cls, { participantEnrollmentExists });
    if (!policy.allowed) {
      // 404 (not 403) to avoid leaking class existence to non-members.
      // Same pattern Gmail / GitHub use for unauthorized reads.
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Attach booked session count
    const bookedSessions = await Schedule.countDocuments({ classId: cls._id });
    res.json({ success: true, data: { ...cls, bookedSessions } });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getClasses, getCourseList, getClassById };
