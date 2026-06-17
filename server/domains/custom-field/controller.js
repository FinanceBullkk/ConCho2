const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// custom-field/controller — thin HTTP handlers (envelope + audit only).

const ENTITY = 'CustomFieldDefinition';

const list = async (req, res) => {
  try {
    const data = await useCases.listDefinitions(req.query);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const create = async (req, res) => {
  try {
    const data = await useCases.createDefinition(req.body);
    auditService.record({ req, action: 'created', entity: ENTITY, entityId: data._id, diff: { after: data } });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const update = async (req, res) => {
  try {
    const { before, after } = await useCases.updateDefinition(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: ENTITY, entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const archive = async (req, res) => {
  try {
    const { before, after } = await useCases.archiveDefinition(req.params.id);
    auditService.record({ req, action: 'archived', entity: ENTITY, entityId: after._id, diff: auditService.diff(before, after) });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const reorder = async (req, res) => {
  try {
    const { entity, orderedIds } = req.body;
    const { before, after } = await useCases.reorderDefinitions(entity, orderedIds);
    // One audit row for the whole reorder — bulk op has no single entityId.
    // The diff is the compact key-sequence before vs after.
    auditService.record({
      req,
      action: 'reordered',
      entity: ENTITY,
      entityId: null,
      diff: { before: { order: before.map((f) => f.key) }, after: { order: after.map((f) => f.key) } },
      note: `Reordered ${entity} custom fields`,
    });
    res.json({ success: true, count: after.length, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { list, create, update, archive, reorder };
