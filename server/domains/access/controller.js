const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const { ALL_CAPABILITIES, capabilitiesForRole } = require('../../policy/capabilities');
const { SYSTEM_ROLES } = require('./grants-loader');
const useCases = require('./use-cases');

const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);

// Back-compat read view (RolesAccessPage viewer). Now reflects the LIVE,
// DB-backed grants rather than the static map.
const getMatrix = (req, res) => {
  try {
    const grants = {};
    SYSTEM_ROLE_KEYS.forEach((role) => { grants[role] = capabilitiesForRole(role); });
    res.json({ success: true, data: { roles: SYSTEM_ROLE_KEYS, capabilities: [...ALL_CAPABILITIES], grants } });
  } catch (error) {
    handleError(res, error);
  }
};

const listRoles = async (req, res) => {
  try {
    res.json({ success: true, data: await useCases.listRoles() });
  } catch (error) {
    handleError(res, error);
  }
};

const createRole = async (req, res) => {
  try {
    const role = await useCases.createRole(req.body);
    auditService.record({ req, action: 'created', entity: 'Role', entityId: role._id, diff: { after: role }, note: `Custom role '${role.key}' created` });
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    handleError(res, error);
  }
};

const updateRole = async (req, res) => {
  try {
    const { before, after } = await useCases.updateRole(req.params.key, req.body);
    auditService.record({ req, action: 'updated', entity: 'Role', entityId: after._id, diff: auditService.diff(before, after), note: `Role '${req.params.key}' grants updated` });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const deleteRole = async (req, res) => {
  try {
    const { before } = await useCases.deleteRole(req.params.key);
    auditService.record({ req, action: 'archived', entity: 'Role', entityId: before._id, diff: { before }, note: `Custom role '${req.params.key}' archived` });
    res.json({ success: true, data: { key: req.params.key, archived: true } });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getMatrix, listRoles, createRole, updateRole, deleteRole };
