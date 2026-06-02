const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

const listPrograms = async (req, res) => {
  try {
    const data = await useCases.listPrograms(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getProgram = async (req, res) => {
  try {
    const data = await useCases.getProgram(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Learning program not found' });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createProgram = async (req, res) => {
  try {
    const data = await useCases.createProgram(req.body);
    auditService.record({
      req,
      action: 'created',
      entity: 'LearningProgram',
      entityId: data._id,
      diff: { after: data },
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateProgram = async (req, res) => {
  try {
    const before = await useCases.getProgram(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Learning program not found' });
    const data = await useCases.updateProgram(req.params.id, req.body);
    auditService.record({
      req,
      action: 'updated',
      entity: 'LearningProgram',
      entityId: data._id,
      diff: auditService.diff(before, data),
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveProgram = async (req, res) => {
  try {
    const before = await useCases.getProgram(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Learning program not found' });
    const data = await useCases.archiveProgram(req.params.id);
    auditService.record({
      req,
      action: 'archived',
      entity: 'LearningProgram',
      entityId: data._id,
      diff: auditService.diff(before, data),
    });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const listCohorts = async (req, res) => {
  try {
    const data = await useCases.listCohorts(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getCohort = async (req, res) => {
  try {
    const data = await useCases.getCohort(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: 'Cohort not found' });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createCohort = async (req, res) => {
  try {
    const data = await useCases.createCohort(req.body);
    auditService.record({
      req,
      action: 'created',
      entity: 'Class',
      entityId: data._id,
      diff: { after: data },
      note: 'Created through learning cohort API',
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listPrograms,
  getProgram,
  createProgram,
  updateProgram,
  archiveProgram,
  listCohorts,
  getCohort,
  createCohort,
};
