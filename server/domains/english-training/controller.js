// English-training — HTTP controller (Phase 1: read-only admin projections).
// Thin handlers: fetch via reads, shape via dto, standard success envelope,
// funnel errors through handleError. Writes come from the import script, not HTTP.

const { handleError } = require('../../helpers/handleError');
const reads = require('./reads.pg');
const dto = require('./dto');
const corrections = require('./corrections');
const evaluation = require('./evaluation');
const managedPeople = require('./managed-people');
const managedPeopleRepository = require('./managed-people-repository.pg');
const userLifecycle = require('../../controllers/user/user-lifecycle');
const { invalidateUserCache } = require('../../middleware/auth');
const canonicalOperations = require('./canonical-operations');
const auditService = require('../../services/auditService');

const notFound = (res, msg) => res.status(404).json({ success: false, message: msg });

const getWorkspaceOverview = async (req, res) => {
  try { res.json({ success: true, data: await managedPeopleRepository.getOverview() }); }
  catch (e) { handleError(res, e); }
};

const listEnglishTeachers = async (req, res) => {
  try { res.json({ success: true, data: await managedPeopleRepository.listTeachers() }); }
  catch (e) { handleError(res, e); }
};

const createCanonicalClass = async (req, res) => {
  try {
    const result = await canonicalOperations.createClassCourseRun(req.body, req.user);
    await auditService.record({
      req,
      action: 'created',
      entity: 'EnglishCohort',
      entityId: result.cohortId,
      diff: { after: result },
      note: 'Created stable English class, current PIC assignment, and first Course Run atomically',
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const addCanonicalRunEnrollment = async (req, res) => {
  try {
    const result = await canonicalOperations.addRunEnrollment({
      courseRunId: req.params.courseRunId,
      ...req.body,
    }, req.user);
    await auditService.record({
      req, action: 'created', entity: 'EnglishRunEnrollment',
      entityId: result.enrollmentId, diff: { after: result },
      note: 'Started learner in canonical English Course Run',
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const createCanonicalAttendanceSession = async (req, res) => {
  try {
    const result = await canonicalOperations.createAttendanceSession({
      courseRunId: req.params.courseRunId,
      ...req.body,
    }, req.user);
    await auditService.record({
      req, action: 'created', entity: 'EnglishSessionUnit',
      entityId: result.sessionUnitId, diff: { after: result },
      note: 'Created canonical English Meeting and credited Session Unit',
    });
    res.status(201).json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const rescheduleCanonicalMeeting = async (req, res) => {
  try {
    const result = await canonicalOperations.rescheduleMeeting({
      courseRunId: req.params.courseRunId,
      meetingId: req.params.meetingId,
      ...req.body,
    }, req.user);
    await auditService.record({
      req, action: 'updated', entity: 'EnglishMeeting',
      entityId: result.meetingId,
      diff: auditService.diff(result.before, result.after),
      note: req.body.reason || 'English Meeting rescheduled',
    });
    res.json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const cancelCanonicalMeeting = async (req, res) => {
  try {
    const result = await canonicalOperations.cancelMeeting({
      courseRunId: req.params.courseRunId,
      meetingId: req.params.meetingId,
      cancellationReason: req.body.cancellationReason,
    }, req.user);
    await auditService.record({
      req, action: 'cancelled', entity: 'EnglishMeeting',
      entityId: result.meetingId,
      diff: { before: result.before, after: result.after },
      note: req.body.cancellationReason,
    });
    res.json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const getCanonicalAttendanceRoster = async (req, res) => {
  try {
    const data = await canonicalOperations.getAttendanceRoster(req.params);
    res.json({ success: true, data });
  } catch (e) { handleError(res, e); }
};

const saveCanonicalAttendanceRoster = async (req, res) => {
  try {
    const result = await canonicalOperations.saveAttendanceRoster({
      courseRunId: req.params.courseRunId,
      sessionUnitId: req.params.sessionUnitId,
      ...req.body,
    }, req.user);
    await auditService.record({
      req, action: 'updated', entity: 'EnglishAttendanceRoster',
      entityId: req.params.sessionUnitId, diff: { after: result },
      note: 'Saved complete canonical English attendance roster',
    });
    res.json({ success: true, data: result });
  } catch (e) { handleError(res, e); }
};

const listManagedPeople = async (req, res) => {
  try {
    const result = await managedPeople.listManagedPeople(req.query);
    res.json({ success: true, data: result.rows, total: result.total });
  } catch (e) { handleError(res, e); }
};

const createManagedPerson = async (req, res) => {
  try {
    const person = await managedPeople.createManagedPerson(req.body);
    const data = person.toObject ? person.toObject() : person;
    delete data.password;
    auditService.record({
      req,
      action: 'created',
      entity: 'ManagedLearner',
      entityId: data._id,
      diff: { after: auditService.stripSensitive(data) },
    });
    res.status(201).json({ success: true, data });
  } catch (e) { handleError(res, e); }
};

const updateManagedPerson = async (req, res) => {
  try {
    const result = await managedPeople.updateManagedPerson(req.params.id, req.body);
    invalidateUserCache(req.params.id);
    auditService.record({
      req,
      action: 'updated',
      entity: 'ManagedLearner',
      entityId: req.params.id,
      diff: auditService.diff(result.before, result.after),
    });
    res.json({ success: true, data: result.after });
  } catch (e) { handleError(res, e); }
};

const deleteManagedPerson = async (req, res) => {
  try {
    const person = await managedPeopleRepository.findById(req.params.id);
    if (!person) return notFound(res, 'Managed learner not found');
    if (person.canLogin !== false) {
      return res.status(409).json({
        success: false,
        message: 'Login-enabled users must be maintained in Admin Console',
      });
    }
    return userLifecycle.deleteUser(req, res);
  } catch (e) { handleError(res, e); }
};

const provisionManagedPeople = async (req, res) => {
  try {
    const report = await managedPeople.provisionArchivePeople();
    const summary = Object.fromEntries(Object.entries(report).map(([key, rows]) => [key, rows.length]));
    auditService.record({
      req,
      action: 'provisioned',
      entity: 'EnglishManagedLearnerBatch',
      note: JSON.stringify(summary),
    });
    for (const failure of [...report.collisions, ...report.rejected]) {
      auditService.record({
        req,
        action: 'provision-failed',
        entity: 'ManagedLearner',
        entityId: failure.empCode || null,
        note: failure.reason,
      });
    }
    res.json({ success: true, data: report, summary });
  } catch (e) { handleError(res, e); }
};

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

const getClassDetail = async (req, res) => {
  try {
    const data = await reads.getClassDetail(req.params.id);
    if (!data) return notFound(res, 'Cohort not found');
    res.json({ success: true, data: dto.classDetail(data) });
  } catch (e) { handleError(res, e); }
};

const listCourses = async (req, res) => {
  try { res.json({ success: true, data: dto.courseList(await reads.listCourses()) }); }
  catch (e) { handleError(res, e); }
};

const listCanonicalCourseRuns = async (req, res) => {
  try { res.json({ success: true, data: dto.activeCourseRunList(await reads.listActiveCourseRuns()) }); }
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
  getWorkspaceOverview,
  listEnglishTeachers,
  createCanonicalClass,
  addCanonicalRunEnrollment,
  createCanonicalAttendanceSession,
  rescheduleCanonicalMeeting,
  cancelCanonicalMeeting,
  getCanonicalAttendanceRoster,
  saveCanonicalAttendanceRoster,
  listManagedPeople, createManagedPerson, updateManagedPerson, deleteManagedPerson, provisionManagedPeople,
  getOverview,
  listCohorts, getCohort, getClassDetail, listCourses, getCourseRun, listEmployees, getEmployee,
  listCanonicalCourseRuns,
  listSessions, getSessionAttendance, listEligibility,
  listIssues, listIssueDetails,
  correctEmployee,
  listLevels, listPendingExamEntries, recordExamResult, deleteExamResult,
};
