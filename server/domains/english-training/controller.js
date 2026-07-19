// English-training — HTTP controller (Phase 1: read-only admin projections).
// Thin handlers: fetch via reads, shape via dto, standard success envelope,
// funnel errors through handleError. Writes come from the import script, not HTTP.

const { handleError } = require('../../helpers/handleError');
const reads = require('./reads.pg');
const dto = require('./dto');
const corrections = require('./corrections');
const evaluation = require('./evaluation');
const auditService = require('../../services/auditService');

const notFound = (res, msg) => res.status(404).json({ success: false, message: msg });

const getOverview = async (req, res) => {
  try { res.json({ success: true, data: dto.overview(await reads.getOverview()) }); }
  catch (e) { handleError(res, e); }
};

const listCohorts = async (req, res) => {
  try { res.json({ success: true, data: dto.cohortList(await reads.listCohorts()) }); }
  catch (e) { handleError(res, e); }
};

const getCohort = async (req, res) => {
  try {
    const data = await reads.getCohort(req.params.id);
    if (!data) return notFound(res, 'Cohort not found');
    res.json({ success: true, data: dto.cohortDetail(data) });
  } catch (e) { handleError(res, e); }
};

const listCourses = async (req, res) => {
  try { res.json({ success: true, data: dto.courseList(await reads.listCourses()) }); }
  catch (e) { handleError(res, e); }
};

const getCourseRun = async (req, res) => {
  try {
    const data = await reads.getCourseRun(req.params.id);
    if (!data) return notFound(res, 'Course run not found');
    res.json({ success: true, data: dto.courseRunDetail(data) });
  } catch (e) { handleError(res, e); }
};

const listEmployees = async (req, res) => {
  try {
    const rows = await reads.listEmployees({
      q: req.query.q, limit: req.query.limit, offset: req.query.offset,
    });
    res.json({ success: true, data: dto.employeeList(rows), count: rows.length });
  } catch (e) { handleError(res, e); }
};

const getEmployee = async (req, res) => {
  try {
    const data = await reads.getEmployeeByCode(req.params.empCode);
    if (!data) return notFound(res, 'Employee not found');
    res.json({ success: true, data: dto.employeeDetail(data) });
  } catch (e) { handleError(res, e); }
};

const listSessions = async (req, res) => {
  try {
    const rows = await reads.listSessions({ q: req.query.q, limit: req.query.limit, offset: req.query.offset });
    res.json({ success: true, data: dto.sessionList(rows), count: rows.length });
  } catch (e) { handleError(res, e); }
};

const getSessionAttendance = async (req, res) => {
  try {
    const data = await reads.getSessionAttendance(req.params.id);
    if (!data) return notFound(res, 'English-training session not found');
    res.json({ success: true, data: dto.sessionAttendance(data) });
  } catch (e) { handleError(res, e); }
};

const listEligibility = async (req, res) => {
  try {
    const rows = await reads.listEligibility({ q: req.query.q, limit: req.query.limit, offset: req.query.offset });
    res.json({ success: true, data: dto.eligibilityList(rows), count: rows.length });
  } catch (e) { handleError(res, e); }
};

const listIssues = async (req, res) => {
  try { res.json({ success: true, data: dto.issues(await reads.listDataQualityIssues()) }); }
  catch (e) { handleError(res, e); }
};

const listIssueDetails = async (req, res) => {
  try {
    const rows = await reads.listDataQualityIssueDetails(req.params.code);
    res.json({ success: true, data: dto.issueDetails(rows), count: rows.length });
  } catch (e) { handleError(res, e); }
};

const correctEmployee = async (req, res) => {
  try {
    const result = await corrections.correctEmployeeOrg({
      empCode: req.params.empCode,
      ...req.body,
      actor: req.user,
    });
    await auditService.record({
      req,
      action: 'updated',
      entity: 'EnglishTrainingEmployee',
      entityId: result.employee.empCode,
      diff: auditService.diff(result.before, result.after),
      note: req.body.reason,
    });
    res.json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const listLevels = async (req, res) => {
  try { res.json({ success: true, data: dto.levelList(await reads.listLevels()) }); }
  catch (e) { handleError(res, e); }
};

const listPendingExamEntries = async (req, res) => {
  try {
    const rows = await reads.listPendingExamEntries();
    res.json({ success: true, data: dto.pendingExamEntries(rows), count: rows.length });
  } catch (e) { handleError(res, e); }
};

const recordExamResult = async (req, res) => {
  try {
    const result = await evaluation.recordExamResult({
      runEnrollmentId: req.params.id,
      ...req.body,
      actor: req.user,
    });
    await auditService.record({
      req,
      action: result.created ? 'created' : 'updated',
      entity: 'EnglishTrainingExamResult',
      entityId: req.params.id,
      diff: auditService.diff(result.before, result.after),
      note: req.body.note,
    });
    res.status(result.created ? 201 : 200).json({ success: true, data: dto.examResult(result.result) });
  } catch (e) { handleError(res, e); }
};

const deleteExamResult = async (req, res) => {
  try {
    const result = await evaluation.deleteExamResult({ runEnrollmentId: req.params.id });
    await auditService.record({
      req,
      action: 'deleted',
      entity: 'EnglishTrainingExamResult',
      entityId: req.params.id,
      diff: auditService.diff(result.before, result.after),
    });
    res.json({ success: true, data: { deleted: true } });
  } catch (e) { handleError(res, e); }
};

module.exports = {
  getOverview,
  listCohorts, getCohort, listCourses, getCourseRun, listEmployees, getEmployee,
  listSessions, getSessionAttendance, listEligibility,
  listIssues, listIssueDetails,
  correctEmployee,
  listLevels, listPendingExamEntries, recordExamResult, deleteExamResult,
};
