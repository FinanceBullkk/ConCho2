const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// compliance/controller — thin HTTP handlers (envelope + audit only).
// ──────────────────────────────────────────────────────────

const listRequirements = async (req, res) => {
  try {
    const data = await useCases.listRequirements();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createRequirement = async (req, res) => {
  try {
    const data = await useCases.createRequirement(req.body, req.user?._id);
    auditService.record({ req, action: 'created', entity: 'RequiredTraining', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateRequirement = async (req, res) => {
  try {
    const { before, after } = await useCases.updateRequirement(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'RequiredTraining', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveRequirement = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveRequirement(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'RequiredTraining', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const getMatrix = async (req, res) => {
  try {
    const data = await useCases.buildMatrix(req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getUserCompliance = async (req, res) => {
  try {
    const data = await useCases.getUserCompliance(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { listRequirements, createRequirement, updateRequirement, archiveRequirement, getMatrix, getUserCompliance };
