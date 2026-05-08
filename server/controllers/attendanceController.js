const attendanceService = require('../services/attendanceService');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// Max rows allowed per analytics page (prevents enormous memory spikes)
const ANALYTICS_MAX_LIMIT = 500;

const parseAnalyticsPagination = (req) => {
  const raw = parsePagination(req);
  const limit = Math.min(Number(raw.limit) || 100, ANALYTICS_MAX_LIMIT);
  const page  = Math.max(Number(raw.page)  || 1,   1);
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
};

// ──────────────────────────────────────────────────────────
// Attendance Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

const bulkMarkAttendance = async (req, res) => {
  try {
    const result = await attendanceService.bulkMark(req.params.scheduleId, req.body.records);

    auditService.record({
      req,
      action: 'marked',
      entity: 'Attendance',
      entityId: req.params.scheduleId,
      note: `Bulk mark: ${result.upserted} created, ${result.modified} updated for schedule ${req.params.scheduleId}`,
    });

    res.json({
      success: true,
      message: `Attendance processed: ${result.upserted} created, ${result.modified} updated`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const getAttendanceBySchedule = async (req, res) => {
  try {
    const records = await attendanceService.getBySchedule(req.params.scheduleId);
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    handleError(res, error);
  }
};

const getAttendanceByUser = async (req, res) => {
  try {
    const records = await attendanceService.getByUser(req.params.userId);
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByEmployee = async (req, res) => {
  try {
    const pagination = parseAnalyticsPagination(req);
    const result = await attendanceService.analyticsByEmployee(req.query.userId, pagination);
    res.json(paginatedResponse(result));
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByTeam = async (req, res) => {
  try {
    const pagination = parseAnalyticsPagination(req);
    const result = await attendanceService.analyticsByTeam(pagination);
    res.json(paginatedResponse(result));
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByClass = async (req, res) => {
  try {
    const data = await attendanceService.analyticsByClass(req.query.classId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getMyStats = async (req, res) => {
  try {
    const stats = await attendanceService.getMyStats(req.user._id);
    res.json({ success: true, data: stats });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  bulkMarkAttendance,
  getAttendanceBySchedule,
  getAttendanceByUser,
  getAnalyticsByEmployee,
  getAnalyticsByTeam,
  getAnalyticsByClass,
  getMyStats,
};
