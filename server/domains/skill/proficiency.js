// ──────────────────────────────────────────────────────────
// Skill proficiency derivation (TMS.update gap #4) — PURE, no I/O.
//
// A learner's proficiency in a skill is DERIVED from the contributing programs
// they have completed (v1 signal = issued certificate). Each completed program
// that builds the skill is +1 level, capped at the skill's `maxLevel`. This
// keeps proficiency honest (always re-computable from real completion data) and
// avoids a stored level that could drift.
//
// Unit-testable without a DB or request.
// ──────────────────────────────────────────────────────────

/** Normalise an id (ObjectId | string) to a string for set membership. */
const sid = (v) => (v == null ? '' : String(v));

/**
 * Derive a learner's level in every skill from their completed program ids.
 * @param {Array} skills - live Skill docs (lean) with programIds + maxLevel
 * @param {Set<string>} completedProgramIds - string ids of completed programs
 * @returns {Map<string, {level:number, max:number, matchedProgramIds:string[]}>}
 *          keyed by skill id (string)
 */
const deriveSkillLevels = (skills, completedProgramIds) => {
  const out = new Map();
  for (const skill of skills) {
    const max = skill.maxLevel || 5;
    const matched = (skill.programIds || []).map(sid).filter((pid) => completedProgramIds.has(pid));
    out.set(sid(skill._id), { level: Math.min(matched.length, max), max, matchedProgramIds: matched });
  }
  return out;
};

/** Required level a role must reach for a skill (0 / absent = not required). */
const targetForRole = (skill, role) => {
  const t = skill && skill.targetByRole ? skill.targetByRole[role] : 0;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Build the role-gap view for one learner: the skills their role requires, with
 * current level, target, and gap (target − level, floored at 0).
 * @param {Array} skills
 * @param {string} role - the learner's system role
 * @param {Map} levelsBySkillId - output of deriveSkillLevels
 * @returns {Array<{skillId:string,name:string,target:number,level:number,gap:number}>}
 */
const roleGap = (skills, role, levelsBySkillId) => {
  const rows = [];
  for (const skill of skills) {
    const target = targetForRole(skill, role);
    if (target <= 0) continue;
    const level = levelsBySkillId.get(sid(skill._id))?.level || 0;
    rows.push({ skillId: sid(skill._id), name: skill.name, target, level, gap: Math.max(0, target - level) });
  }
  return rows;
};

module.exports = { sid, deriveSkillLevels, targetForRole, roleGap };
