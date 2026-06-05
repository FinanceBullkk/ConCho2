const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');

const listAssignments = async (req, res) => {
  try {
    const data = await useCases.listAssignments(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getAssignment = async (req, res) => {
  try {
    const data = await useCases.getAssignment(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createAssignment = async (req, res) => {
  try {
    const data = await useCases.createAssignment(req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'Assignment',
      entityId: data._id,
      diff: { after: data },
      note: 'Training assignment created',
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveAssignment = async (req, res) => {
  try {
    const { before, assignment } = await useCases.archiveAssignment(req.params.id);
    auditService.record({
      req,
      action: 'archived',
      entity: 'Assignment',
      entityId: assignment._id,
      diff: auditService.diff(before, assignment),
      note: 'Training assignment archived',
    });
    res.json({ success: true, data: assignment });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listAssignments,
  getAssignment,
  createAssignment,
  archiveAssignment,
};
