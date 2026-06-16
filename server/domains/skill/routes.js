const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const { CAPABILITIES } = require('../../policy/capabilities');
const controller = require('./controller');
const { createBody, updateBody, learnerParams } = require('./schemas');

// ──────────────────────────────────────────────────────────
// Skills / competency framework (TMS.update gap #4).
//   GET  /                 list skills + workforce holders   (skill.read)
//   GET  /role-profiles    role required-skills + coverage   (skill.manage)
//   GET  /learner/:userId  derived proficiency + role gap    (skill.read; self-or-manage)
//   POST/PUT/DELETE        manage skills (audited)           (skill.manage)
// Two-layer authz: capability here + the controller's self-or-manage check on
// the learner read. Every mutation is audited + soft-deleted.
// ──────────────────────────────────────────────────────────
router.use(protect);

router.get('/', requireCapability(CAPABILITIES.SKILL_READ), controller.listSkills);
router.get('/taxonomy', requireCapability(CAPABILITIES.SKILL_READ), controller.getTaxonomy);
router.get('/role-profiles', requireCapability(CAPABILITIES.SKILL_MANAGE), controller.getRoleProfiles);
router.get('/learner/:userId', requireCapability(CAPABILITIES.SKILL_READ), validate({ params: learnerParams }), controller.getLearnerSkills);
router.get('/learner/:userId/recommendations', requireCapability(CAPABILITIES.SKILL_READ), validate({ params: learnerParams }), controller.getLearnerRecommendations);

router.post('/', requireCapability(CAPABILITIES.SKILL_MANAGE), validate({ body: createBody }), controller.createSkill);
router.put('/:id', requireCapability(CAPABILITIES.SKILL_MANAGE), validate({ params: idParam, body: updateBody }), controller.updateSkill);
router.delete('/:id', requireCapability(CAPABILITIES.SKILL_MANAGE), validate({ params: idParam }), controller.deleteSkill);

module.exports = router;
