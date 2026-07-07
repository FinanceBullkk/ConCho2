const importService = require('../services/importService');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');
// Dual-backend (Mongo ⇔ Postgres) — Phase 5 slice 4 (B6): the historical
// import writes ride the booking-write/attendance seams on ONE unit-of-work
// per session (a failure rolls the schedule + its attendance back together).
const { runInTransaction } = require('../domains/_shared/unit-of-work');
const bookingWriteRepo = require('../domains/schedule/booking-write-repository');
const attendanceRepo = require('../domains/attendance/repository');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// Import Controller (Thin — delegates to Service Layer)
//
// Audit PR L (SEC-013): every bulk import writes an audit line so a
// reviewer can answer "who imported what, when" without grepping logs.
// ──────────────────────────────────────────────────────────

const bulkImportUsers = async (req, res) => {
  try {
    const result = await importService.importUsers(req.body.users);
    invalidateAnalyticsCache();
    auditService.record({
      req,
      action: 'imported',
      entity: 'Import',
      note: `users: ${result.created} created, ${result.updated} updated, ${result.skipped || 0} skipped`,
    });
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
    auditService.record({
      req,
      action: 'imported',
      entity: 'Import',
      note: `classes: ${result.created} created, ${result.updated} updated`,
    });
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
        // P2-06: Use local counters inside the closure, only commit to outer
        // counters after the transaction succeeds. If the transaction rolls back,
        // the outer counters are never incremented — no overreport.
        let sessionSchedules = 0, sessionAttendance = 0;
        // eslint-disable-next-line no-await-in-loop -- one atomic unit per session row
        await runInTransaction(async (tx) => {
          // Create schedule directly (no validation — historical data)
          const schedule = await bookingWriteRepo.insertSession(
            {
              classId: s.classId,
              bookedTeamId: s.teamId,
              startTime: new Date(s.startTime),
              endTime: new Date(s.endTime),
              capacity: Math.max(s.students?.length || 0, 9),
              enrolledUsers: (s.students || []).map(st => st.userId),
            },
            tx,
          );
          sessionSchedules = 1;

          // Create attendance records in the same transaction so a failure rolls back the schedule too
          if (s.students && s.students.length > 0) {
            const records = s.students.map(st => ({
              scheduleId: schedule._id,
              userId: st.userId,
              status: st.status,
            }));
            sessionAttendance = await attendanceRepo.insertAttendanceMany(records, tx);
          }
        });
        // Transaction committed — now safe to update outer counters
        schedulesCreated += sessionSchedules;
        attendanceCreated += sessionAttendance;
      } catch (err) {
        // Transaction rolled back — schedule was not persisted
        errors.push(err.message);
      }
    }

    dbSession.endSession();

    invalidateAnalyticsCache();
    auditService.record({
      req,
      action: 'imported',
      entity: 'Import',
      note: `history: ${schedulesCreated} schedules + ${attendanceCreated} attendance, ${errors.length} errors`,
    });
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

