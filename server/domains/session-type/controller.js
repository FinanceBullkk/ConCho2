const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// session-type/controller — thin HTTP handlers (envelope + audit only).
// ──────────────────────────────────────────────────────────

const listSessionTypes = async (req, res) => {
  try {
    const data = await useCases.listSessionTypes();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createSessionType = async (req, res) => {
  try {
    const data = await useCases.createSessionType(req.body);
    auditService.record({ req, action: 'created', entity: 'SessionType', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateSessionType = async (req, res) => {
  try {
    const { before, after } = await useCases.updateSessionType(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'SessionType', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveSessionType = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveSessionType(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'SessionType', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { listSessionTypes, createSessionType, updateSessionType, archiveSessionType };
