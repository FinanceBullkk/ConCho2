const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// org/controller — thin HTTP handlers (envelope + audit only).
// ──────────────────────────────────────────────────────────

// ── Departments ───────────────────────────────────────────
const listDepartments = async (req, res) => {
  try {
    const data = await useCases.listDepartments(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createDepartment = async (req, res) => {
  try {
    const data = await useCases.createDepartment(req.body);
    auditService.record({ req, action: 'created', entity: 'Department', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { before, after } = await useCases.updateDepartment(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'Department', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveDepartment = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveDepartment(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'Department', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Assignment ────────────────────────────────────────────
const assignUser = async (req, res) => {
  try {
    const { before, after, user } = await useCases.assignUser(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'User', entityId: req.params.id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: user });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Manager dashboard (self-scoped) ───────────────────────
const getMyTeam = async (req, res) => {
  try {
    const data = await useCases.getMyTeam(req.user._id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  assignUser,
  getMyTeam,
};
