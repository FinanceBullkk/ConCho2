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

/**
 * Rank programs by how much of a learner's ROLE-skill gap they close
 * (skills-as-spine, B2). For every gapped skill (target > current level), the
 * programs that BUILD it which the learner has NOT completed are candidates —
 * completing one lifts that skill +1 toward its target. A program's score
 * (`gapClosed`) = how many distinct gapped skills it advances; ties break on the
 * total remaining gap it touches, then program name. Deterministic — the B1 AI
 * layer can re-rank later without changing this contract.
 * @param {Array} skills - live Skill docs (lean) with programIds
 * @param {string} role - the learner's system role
 * @param {Map} levelsBySkillId - output of deriveSkillLevels
 * @param {Set<string>} completedProgramIds - learner's completed program ids
 * @param {Map<string,string>} programNameById - id → name (ACTIVE programs only;
 *        candidates absent from this map are dropped as archived/inactive)
 * @returns {Array<{programId,name,gapClosed,remainingGap,skills:[{skillId,name,fromLevel,toLevel,target}]}>}
 */
const recommendPrograms = (skills, role, levelsBySkillId, completedProgramIds, programNameById) => {
  const byProgram = new Map();
  for (const skill of skills) {
    const target = targetForRole(skill, role);
    if (target <= 0) continue;
    const level = levelsBySkillId.get(sid(skill._id))?.level || 0;
    if (level >= target) continue; // no gap — nothing to recommend for it
    for (const pid of (skill.programIds || []).map(sid)) {
      if (completedProgramIds.has(pid)) continue; // already done → no further lift
      if (!programNameById.has(pid)) continue;    // archived / inactive / missing
      if (!byProgram.has(pid)) {
        byProgram.set(pid, { programId: pid, name: programNameById.get(pid), gapClosed: 0, remainingGap: 0, skills: [] });
      }
      const entry = byProgram.get(pid);
      entry.gapClosed += 1;
      entry.remainingGap += target - level;
      entry.skills.push({ skillId: sid(skill._id), name: skill.name, fromLevel: level, toLevel: Math.min(level + 1, target), target });
    }
  }
  return [...byProgram.values()].sort(
    (a, b) => b.gapClosed - a.gapClosed || b.remainingGap - a.remainingGap || (a.name || '').localeCompare(b.name || ''),
  );
};

module.exports = { sid, deriveSkillLevels, targetForRole, roleGap, recommendPrograms };
