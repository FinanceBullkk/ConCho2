const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');

const listPaths = async (req, res) => {
  try {
    const data = await useCases.listPaths(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getPath = async (req, res) => {
  try {
    const data = await useCases.getPath(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Learning path not found' });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createPath = async (req, res) => {
  try {
    const data = await useCases.createPath(req.body);
    auditService.record({
      req,
      action: 'created',
      entity: 'LearningPath',
      entityId: data._id,
      diff: { after: data },
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updatePath = async (req, res) => {
  try {
    const { before, path } = await useCases.updatePath(req.params.id, req.body);
    auditService.record({
      req,
      action: 'updated',
      entity: 'LearningPath',
      entityId: path._id,
      diff: auditService.diff(before, path),
    });
    res.json({ success: true, data: path });
  } catch (error) {
    handleError(res, error);
  }
};

const archivePath = async (req, res) => {
  try {
    const { before, path } = await useCases.archivePath(req.params.id);
    auditService.record({
      req,
      action: 'archived',
      entity: 'LearningPath',
      entityId: path._id,
      diff: auditService.diff(before, path),
    });
    res.json({ success: true, data: path });
  } catch (error) {
    handleError(res, error);
  }
};

const getPathProgress = async (req, res) => {
  try {
    const data = await useCases.getPathProgress(req.params.id, req.user._id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listPaths,
  getPath,
  createPath,
  updatePath,
  archivePath,
  getPathProgress,
};
