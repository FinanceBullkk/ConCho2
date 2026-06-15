const auditService = require('../../services/auditService');
const { handleError } = require('../../helpers/handleError');
const { actorHasCapability, CAPABILITIES } = require('../../policy/capabilities');
const useCases = require('./use-cases');

const listSkills = async (req, res) => {
  try {
    res.json({ success: true, data: await useCases.listSkills() });
  } catch (error) {
    handleError(res, error);
  }
};

const getRoleProfiles = async (req, res) => {
  try {
    res.json({ success: true, data: await useCases.getRoleProfiles() });
  } catch (error) {
    handleError(res, error);
  }
};

// Self-or-manage: a learner reads their OWN skills (skill.read); reading another
// learner's skills requires skill.manage. The route already enforces skill.read.
const getLearnerSkills = async (req, res) => {
  try {
    const { userId } = req.params;
    const isSelf = String(userId) === String(req.user._id);
    if (!isSelf && !actorHasCapability(req.user, CAPABILITIES.SKILL_MANAGE)) {
      return res.status(403).json({ success: false, message: 'Not allowed to view this learner’s skills' });
    }
    res.json({ success: true, data: await useCases.getLearnerSkills(userId) });
  } catch (error) {
    handleError(res, error);
  }
};

const createSkill = async (req, res) => {
  try {
    const skill = await useCases.createSkill(req.body);
    auditService.record({ req, action: 'created', entity: 'Skill', entityId: skill._id, diff: { after: skill }, note: `Skill '${skill.name}' created` });
    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    handleError(res, error);
  }
};

const updateSkill = async (req, res) => {
  try {
    const { before, after } = await useCases.updateSkill(req.params.id, req.body);
    auditService.record({ req, action: 'updated', entity: 'Skill', entityId: after._id, diff: auditService.diff(before, after), note: `Skill '${after.name}' updated` });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

const deleteSkill = async (req, res) => {
  try {
    const { before } = await useCases.deleteSkill(req.params.id);
    auditService.record({ req, action: 'archived', entity: 'Skill', entityId: before._id, diff: { before }, note: `Skill '${before.name}' archived` });
    res.json({ success: true, data: { id: req.params.id, archived: true } });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { listSkills, getRoleProfiles, getLearnerSkills, createSkill, updateSkill, deleteSkill };
