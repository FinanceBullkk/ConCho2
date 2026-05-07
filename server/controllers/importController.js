const importService = require('../services/importService');
const { handleError } = require('../helpers/handleError');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// Import Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

const bulkImportUsers = async (req, res) => {
  try {
    const result = await importService.importUsers(req.body.users);
    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `Import complete: ${result.created} created, ${result.updated} updated`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const bulkImportClasses = async (req, res) => {
  try {
    const result = await importService.importClasses(req.body.classes);
    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `Import complete: ${result.created} created, ${result.updated} updated`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * Bulk import historical schedules + attendance.
 * Bypasses normal schedule validation (time slot, weekly limit, collision)
 * because historical data predates the TMS system.
 *
 * Body: { sessions: [{ classId, teamId, startTime, endTime, students: [{ userId, status }] }] }
 */
const bulkImportHistory = async (req, res) => {
  try {
    const { sessions } = req.body;
    if (!Array.isArray(sessions)) {
      return res.status(400).json({ success: false, message: 'sessions array required' });
    }

    const MAX_SESSIONS_BATCH = 500;
    if (sessions.length > MAX_SESSIONS_BATCH) {
      return res.status(400).json({
        success: false,
        message: `Too many sessions. Maximum ${MAX_SESSIONS_BATCH} per request. Got ${sessions.length}. Split into smaller batches.`,
      });
    }

    let schedulesCreated = 0, attendanceCreated = 0, errors = [];

    for (const s of sessions) {
      try {
        // Create schedule directly (no validation)
        const schedule = await Schedule.create({
          classId: s.classId,
          bookedTeamId: s.teamId,
          startTime: new Date(s.startTime),
          endTime: new Date(s.endTime),
          capacity: Math.max(s.students?.length || 0, 9),
          enrolledUsers: (s.students || []).map(st => st.userId),
        });
        schedulesCreated++;

        // Create attendance records
        if (s.students && s.students.length > 0) {
          const records = s.students.map(st => ({
            scheduleId: schedule._id,
            userId: st.userId,
            status: st.status,
          }));
          
          // Use insertMany with ordered:false to skip duplicates
          try {
            const result = await Attendance.insertMany(records, { ordered: false });
            attendanceCreated += result.length;
          } catch (bulkErr) {
            // Partial insert — count what succeeded
            if (bulkErr.insertedDocs) attendanceCreated += bulkErr.insertedDocs.length;
          }
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `Imported ${schedulesCreated} schedules, ${attendanceCreated} attendance records`,
      data: { schedulesCreated, attendanceCreated, errors: errors.slice(0, 10) },
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { bulkImportUsers, bulkImportClasses, bulkImportHistory };

