const attendanceService = require('../services/attendanceService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Attendance Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

const bulkMarkAttendance = async (req, res) => {
  try {
    const result = await attendanceService.bulkMark(req.params.scheduleId, req.body.records);
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
    const data = await attendanceService.analyticsByEmployee(req.query.userId);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByTeam = async (req, res) => {
  try {
    const data = await attendanceService.analyticsByTeam();
    res.json({ success: true, count: data.length, data });
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
