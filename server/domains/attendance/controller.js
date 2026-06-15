const attendanceService = require('./use-cases');
const auditService = require('../../services/auditService');
const attendancePolicy = require('../../policy/attendance');
const sessionInstructorsPolicy = require('../../policy/sessionInstructors');
const { isCohortAssignedOnly } = require('../schedule/facilitator-visibility-policy');
const repository = require('./repository');
const { handleError } = require('../../helpers/handleError');
const { parsePagination, paginatedResponse } = require('../../helpers/pagination');

// ──────────────────────────────────────────────────────────
// Attendance Controller (Thin — delegates to the domain use-cases)
// ──────────────────────────────────────────────────────────
// Phase 1 domain extraction: relocated from controllers/attendanceController.js
// (behavior-preserving). Authz unchanged — the Phase 3 UNION
// (cohort-teacher OR named session instructor) is preserved verbatim.

// Audit PR 5 (AUTHZ-001) — resolve a schedule's class so the policy can
// gate Teacher access by Class.teacherIds. re-center Phase 3 (DELTA B): also
// load the schedule's sessionInstructorIds so a named internal trainer joins
// the UNION. Returns { cls, schedule }, or null when the schedule / class is
// missing.
const loadClassForSchedule = async (scheduleId) => {
  const sch = await repository.findScheduleForAuthz(scheduleId);
  if (!sch) return null;
  const cls = await repository.findClassById(sch.classId);
  if (!cls) return null;
  // facilitatorPolicy.visibility === 'assigned_only' → only named instructors
  // (not the standing cohort-teacher binding) may mark/read this session.
  const assignedOnly = await isCohortAssignedOnly(sch.classId);
  return { cls, schedule: sch, assignedOnly };
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

const bulkMarkAttendance = async (req, res) => {
  try {
    // Audit PR 5 (AUTHZ-001): only Admin or a Teacher bound to the schedule's
    // class may mark attendance. re-center Phase 3 (DELTA B): a named internal
    // trainer on this session is also allowed (UNION) — cohort teacher kept.
    const loaded = await loadClassForSchedule(req.params.scheduleId);
    if (!loaded) return res.status(404).json({ success: false, message: 'Schedule or class not found' });
    const decision = sessionInstructorsPolicy.canMarkSession(
      req.user, loaded.cls, loaded.schedule, { assignedOnly: loaded.assignedOnly },
    );
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
    // exposes participant identities + attendance state. UNION with the named
    // session instructor (Phase 3, DELTA B).
    const loaded = await loadClassForSchedule(req.params.scheduleId);
    if (!loaded) return res.status(404).json({ success: false, message: 'Schedule or class not found' });
    const decision = sessionInstructorsPolicy.canReadSession(
      req.user, loaded.cls, loaded.schedule, { assignedOnly: loaded.assignedOnly },
    );
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
    const cls = await repository.findClassById(req.query.classId);
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
