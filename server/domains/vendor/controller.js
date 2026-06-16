const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// vendor/controller — thin HTTP handlers (envelope + audit only) for A2.
// ──────────────────────────────────────────────────────────

const listVendors = async (req, res) => {
  try {
    const data = await useCases.list(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getVendor = async (req, res) => {
  try {
    const data = await useCases.getOne(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const createVendor = async (req, res) => {
  try {
    const data = await useCases.create(req.body, req.user?._id);
    auditService.record({ req, action: 'created', entity: 'Vendor', entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const updateVendor = async (req, res) => {
  try {
    const { before, after } = await useCases.update(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'Vendor', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archiveVendor = async (req, res) => {
  try {
    const { before, after } = await useCases.archive(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'Vendor', entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const addRating = async (req, res) => {
  try {
    const data = await useCases.addRating(req.params.id, req.body, req.user?._id);
    auditService.record({ req, action: 'updated', entity: 'Vendor', entityId: data._id, diff: { after: { rating: req.body.value } } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getSpend = async (req, res) => {
  try {
    const data = await useCases.getSpend(req.params.id, req.query);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  archiveVendor,
  addRating,
  getSpend,
};
