const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const useCases = require('./use-cases');

// ── Update Schedule (admin) ───────────────────────────────
// Thin HTTP handler — all logic lives in use-cases.
// Expects req._preSnapshot (lean doc) set by the adapter in scheduleController.

const updateSchedule = async (req, res) => {
  try {
    const schedule = await useCases.updateSchedule(req.params.id, req.body);

    // Audit with real req object (requestId, user, etc.)
    const existing = req._preSnapshot;
    if (existing) {
      auditService.record({
        req,
        action: 'updated',
        entity: 'Schedule',
        entityId: req.params.id,
        diff: auditService.diff
          ? auditService.diff(existing, schedule.toObject())
          : { before: existing, after: schedule.toObject() },
      });
    }

    // Calendar event update audit (if synced)
    if (schedule.googleEventId) {
      auditService.record({
        req,
        action: 'calendar-event-updated',
        entity: 'Schedule',
        entityId: schedule._id,
        note: `Google event ${schedule.googleEventId}`,
      });
    }

    invalidateAnalyticsCache();
    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Delete Schedule (admin) ───────────────────────────────

const deleteSchedule = async (req, res) => {
  try {
    const { schedule, deletedAttendance, calendarDeleted, googleEventId } =
      await useCases.deleteSchedule(req.params.id);

    // Calendar event deletion audit
    if (calendarDeleted && googleEventId) {
      auditService.record({
        req,
        action: 'calendar-event-deleted',
        entity: 'Schedule',
        entityId: schedule._id,
        note: `Google event ${googleEventId}`,
      });
    }

    auditService.record({
      req,
      action: 'deleted',
      entity: 'Schedule',
      entityId: schedule._id,
      note: `Cascade: ${deletedAttendance} attendance records`,
    });

    res.json({
      success: true,
      message: 'Schedule deleted',
      cascade: { deletedAttendance },
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  updateSchedule,
  deleteSchedule,
};