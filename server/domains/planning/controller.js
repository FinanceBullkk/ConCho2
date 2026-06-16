const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// planning/controller — thin HTTP handlers (envelope + audit only) for A4.
// ──────────────────────────────────────────────────────────

// ── Requests ─────────────────────────────────────────────────────────────────
const createRequest = async (req, res) => {
  try {
    const data = await useCases.createRequest(req.body, req.user?._id);
    auditService.record({ req, action: 'created', entity: 'TrainingRequest', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const listRequests = async (req, res) => {
  try {
    const data = await useCases.listRequests(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateRequestStatus = async (req, res) => {
  try {
    const { before, after } = await useCases.updateRequestStatus(req.params.id, req.body.status);
    auditService.record({ req, action: 'updated', entity: 'TrainingRequest', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveRequest = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveRequest(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'TrainingRequest', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const getDemand = async (req, res) => {
  try {
    const data = await useCases.buildDemand(req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Plan ─────────────────────────────────────────────────────────────────────
const getPlan = async (req, res) => {
  try {
    const data = await useCases.getPlan(req.params.fiscalYear);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const upsertPlan = async (req, res) => {
  try {
    const { before, after, created } = await useCases.upsertPlan(req.params.fiscalYear, req.body, req.user?._id);
    auditService.record({
      req, action: created ? 'created' : 'updated', entity: 'TrainingPlan', entityId: after._id,
      diff: created ? { after } : auditService.diff(before, after),
    });
    res.status(created ? 201 : 200).json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const scheduleItem = async (req, res) => {
  try {
    const { cohort, plan, budgetId } = await useCases.scheduleItem(req.params.fiscalYear, req.params.itemId, req.body, req.user?._id);
    // The cohort creation + plan update both warrant a trail.
    auditService.record({ req, action: 'created', entity: 'Class', entityId: cohort._id, diff: { after: { classCode: cohort.classCode, programId: cohort.programId } } });
    auditService.record({ req, action: 'updated', entity: 'TrainingPlan', entityId: plan._id, diff: { after: { scheduledItem: req.params.itemId, cohortId: cohort._id, budgetId } } });
    res.status(201).json({ success: true, data: { cohort, plan, budgetId } });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  createRequest,
  listRequests,
  updateRequestStatus,
  archiveRequest,
  getDemand,
  getPlan,
  upsertPlan,
  scheduleItem,
};
