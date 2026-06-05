const attendanceService = require('../services/attendanceService');
const auditService = require('../services/auditService');
const attendancePolicy = require('../policy/attendance');
const Schedule = require('../models/Schedule');
const Class = require('../models/Class');
const { handleError } = require('../helpers/handleError');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

// Audit PR 5 (AUTHZ-001) — resolve a schedule's class so the policy can
// gate Teacher access by Class.teacherIds. Returns the lean class doc,
// or null when the schedule / class is missing.
const loadClassForSchedule = async (scheduleId) => {
  const sch = await Schedule.findById(scheduleId).select('classId').lean();
  if (!sch) return null;
  return Class.findById(sch.classId).lean();
};

const policyDeny = (res, decision) =>
  res.status(403).json({
    success: false,
    message: 'You are not permitted to mark or read attendance for this class',
    reason: decision.reason,
  });

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
    // Audit PR 5 (AUTHZ-001): only Admin or a Teacher bound to the
    // schedule's class may mark attendance.
    const cls = await loadClassForSchedule(req.params.scheduleId);
    if (!cls) return res.status(404).json({ success: false, message: 'Schedule or class not found' });
    const decision = attendancePolicy.canMark(req.user, cls);
    if (!decision.allowed) return policyDeny(res, decision);

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
    // Audit PR 5 (AUTHZ-001): same gate as bulkMark — viewing the roster
    // exposes participant identities + attendance state.
    const cls = await loadClassForSchedule(req.params.scheduleId);
    if (!cls) return res.status(404).json({ success: false, message: 'Schedule or class not found' });
    const decision = attendancePolicy.canReadBySchedule(req.user, cls);
    if (!decision.allowed) return policyDeny(res, decision);

    const records = await attendanceService.getBySchedule(req.params.scheduleId);
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    handleError(res, error);
  }
};

const getAttendanceByUser = async (req, res) => {
  try {
    const records = await attendanceService.getByUser(req.params.userId, req.user);
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByEmployee = async (req, res) => {
  try {
    const pagination = parseAnalyticsPagination(req);
    const result = await attendanceService.analyticsByEmployee(req.query.userId, pagination, req.user);
    res.json(paginatedResponse(result));
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByTeam = async (req, res) => {
  try {
    const pagination = parseAnalyticsPagination(req);
    const result = await attendanceService.analyticsByTeam(pagination, req.user);
    res.json(paginatedResponse(result));
  } catch (error) {
    handleError(res, error);
  }
};

const getAnalyticsByClass = async (req, res) => {
  try {
    const cls = await Class.findById(req.query.classId).lean();
    if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });
    const decision = attendancePolicy.canReadBySchedule(req.user, cls);
    if (!decision.allowed) return policyDeny(res, decision);

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
