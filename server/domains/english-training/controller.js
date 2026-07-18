// English-training — HTTP controller (Phase 1: read-only admin projections).
// Thin handlers: fetch via reads, shape via dto, standard success envelope,
// funnel errors through handleError. Writes come from the import script, not HTTP.

const { handleError } = require('../../helpers/handleError');
const reads = require('./reads.pg');
const dto = require('./dto');
const corrections = require('./corrections');
const auditService = require('../../services/auditService');

const notFound = (res, msg) => res.status(404).json({ success: false, message: msg });

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

module.exports = {
  listCohorts, getCohort, listCourses, getCourseRun, listEmployees, getEmployee,
  listIssues, listIssueDetails,
  correctEmployee,
};
