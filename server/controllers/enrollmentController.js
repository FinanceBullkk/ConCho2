const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Enrollment Controller
// ──────────────────────────────────────────────────────────

/**
 * Enrich a list of (lean) enrollments with per-(user, class) attendance counts.
 * Mutates nothing; returns a new array of enrollments with `.attendance` attached.
 */
const enrichWithAttendance = async (enrollments) => {
  if (enrollments.length === 0) return enrollments;

  const classIds = [...new Set(enrollments.map(e => e.classId?._id?.toString()).filter(Boolean))];
  const userIds = enrollments.map(e => e.userId?._id?.toString()).filter(Boolean);

  const schedules = classIds.length
    ? await Schedule.find({ classId: { $in: classIds } }).select('_id classId').lean()
    : [];
  const scheduleIds = schedules.map(s => s._id);
  const attendanceRecords = scheduleIds.length
    ? await Attendance.find({ scheduleId: { $in: scheduleIds }, userId: { $in: userIds } })
        .select('scheduleId userId status').lean()
    : [];

  const scheduleMap = {};
  schedules.forEach(s => { scheduleMap[s._id.toString()] = s; });

  const attMap = {};
  attendanceRecords.forEach(a => {
    const sched = scheduleMap[a.scheduleId.toString()];
    if (!sched) return;
    const key = `${a.userId}|${sched.classId}`;
    if (!attMap[key]) attMap[key] = { P: 0, A: 0, L: 0, EL: 0, total: 0 };
    attMap[key][a.status] = (attMap[key][a.status] || 0) + 1;
    attMap[key].total += 1;
  });

  return enrollments.map(e => ({
    ...e,
    attendance: attMap[`${e.userId?._id}|${e.classId?._id}`] || { P: 0, A: 0, L: 0, EL: 0, total: 0 },
  }));
};

/**
 * GET /api/enrollments
 * List enrollments with optional filters. When `classId` is provided,
 * results are enriched with per-user attendance summary.
 */
const getEnrollments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.teamId) filter.teamId = req.query.teamId;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.classId) filter.classId = req.query.classId;

    const needsAttendance = !!req.query.classId;
    const query = Enrollment.find(filter)
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name')
      .sort({ joinedAt: -1 });

    const enrollments = needsAttendance ? await query.lean() : await query;
    const data = needsAttendance ? await enrichWithAttendance(enrollments) : enrollments;

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/enrollments/team/:teamId
 * All enrollments for a specific team, enriched with attendance summary.
 */
const getTeamEnrollments = async (req, res) => {
  try {
    const { teamId } = req.params;
    const statusFilter = req.query.status; // optional: 'Active', 'All', etc.

    const filter = { teamId };
    if (statusFilter && statusFilter !== 'All') {
      filter.status = statusFilter;
    }

    const enrollments = await Enrollment.find(filter)
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name classId')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name')
      .sort({ status: 1, joinedAt: -1 })
      .lean();

    const enriched = await enrichWithAttendance(enrollments);
    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/enrollments/user/:userId
 * Full learning timeline for a specific user.
 */
const getUserEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.params.userId })
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name')
      .sort({ joinedAt: -1 })
      .lean();

    res.json({ success: true, count: enrollments.length, data: enrollments });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/enrollments/:id
 * Update enrollment status/note (Admin manual override).
 * E.g. mark as Completed or Dropped.
 */
const updateEnrollment = async (req, res) => {
  try {
    const { status, note } = req.body;
    const update = {};
    if (status !== undefined) {
      update.status = status;
      // If marking as non-Active, set leftAt
      if (status !== 'Active' && !req.body.leftAt) {
        update.leftAt = new Date();
      }
      if (status === 'Active') {
        update.leftAt = null;
      }
    }
    if (note !== undefined) update.note = note;

    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    )
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name');

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    res.json({ success: true, data: enrollment });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/enrollments/check-conflicts
 * Check if the given memberIds are already active in another team.
 */
const checkConflicts = async (req, res) => {
  try {
    const { teamId, memberIds } = req.body;
    if (!memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ success: false, message: 'memberIds must be an array' });
    }

    // Find Active enrollments for these users that are NOT in the target team
    const conflicts = await Enrollment.find({
      userId: { $in: memberIds },
      status: 'Active',
      teamId: { $ne: teamId }, // Ignore if they are already in THIS team (that's not a transfer)
    })
      .populate('userId', 'empCode name department')
      .populate('teamId', 'name')
      .lean();

    const formattedConflicts = conflicts.map(c => ({
      userId: c.userId._id,
      name: c.userId.name,
      empCode: c.userId.empCode,
      currentTeamId: c.teamId?._id,
      currentTeamName: c.teamId?.name || 'Unknown Team',
    }));

    res.json({ success: true, data: formattedConflicts });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getEnrollments, getTeamEnrollments, getUserEnrollments, updateEnrollment, checkConflicts };
