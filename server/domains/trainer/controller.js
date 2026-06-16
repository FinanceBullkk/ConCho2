const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// trainer/controller — thin HTTP handlers (envelope + audit only) for A6.
// ──────────────────────────────────────────────────────────

const listTrainers = async (req, res) => {
  try {
    const data = await useCases.listTrainers(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getTrainer = async (req, res) => {
  try {
    const data = await useCases.getTrainer(req.params.userId);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const upsertProfile = async (req, res) => {
  try {
    const { before, after, trainer, created } = await useCases.upsertProfile(req.params.userId, req.body, req.user?._id);
    auditService.record({
      req, action: created ? 'created' : 'updated', entity: 'TrainerProfile', entityId: after._id,
      diff: created ? { after } : auditService.diff(before, after),
    });
    res.status(created ? 201 : 200).json({ success: true, data: trainer });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveProfile = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveProfile(req.params.userId);
    auditService.record({ req, action: 'archived', entity: 'TrainerProfile', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const addRating = async (req, res) => {
  try {
    const data = await useCases.addRating(req.params.userId, req.body, req.user?._id);
    auditService.record({ req, action: 'updated', entity: 'TrainerProfile', entityId: data.userId, diff: { after: { rating: req.body.value } } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getLoad = async (req, res) => {
  try {
    const data = await useCases.getLoad(req.params.userId, req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listTrainers,
  getTrainer,
  upsertProfile,
  archiveProfile,
  addRating,
  getLoad,
};
