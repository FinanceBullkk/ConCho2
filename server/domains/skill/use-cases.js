const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./repository');
const { skillDto } = require('./dto');
const { sid, deriveSkillLevels, targetForRole, roleGap } = require('./proficiency');

// Skill / competency framework business rules (TMS.update gap #4).

// ── Studio: skill list + workforce holders ────────────────
const listSkills = async () => {
  const [skills, holdersByProgram] = await Promise.all([
    repository.listLive(),
    repository.holdersByProgram(),
  ]);
  const dtos = skills.map((s) => {
    // Distinct certified holders across ALL programs that build this skill.
    const set = new Set();
    for (const pid of s.programIds || []) {
      const users = holdersByProgram.get(String(pid));
      if (users) for (const u of users) set.add(u);
    }
    return skillDto(s, set.size);
  });
  const categories = [...new Set(skills.map((s) => s.category || 'General'))].sort();
  return { skills: dtos, categories };
};

// ── Studio: role skill profiles + coverage ────────────────
// Coverage% for a role = fraction of (role-user × required-skill) competency
// slots where the user's derived level already meets the target. Computed in one
// in-memory pass over a single cert aggregation (cheap at ~1k users).
const getRoleProfiles = async () => {
  const [skills, completedByUser, users] = await Promise.all([
    repository.listLive(),
    repository.completedProgramIdsByUser(),
    repository.listUsersWithRole(),
  ]);

  // Which roles are required by at least one skill?
  const rolesRequired = new Set();
  for (const s of skills) {
    for (const [role, lvl] of Object.entries(s.targetByRole || {})) {
      if (Number(lvl) > 0) rolesRequired.add(role);
    }
  }

  const usersByRole = new Map();
  for (const u of users) {
    if (!usersByRole.has(u.role)) usersByRole.set(u.role, []);
    usersByRole.get(u.role).push(u);
  }

  const profiles = [];
  for (const role of rolesRequired) {
    const required = skills.filter((s) => targetForRole(s, role) > 0);
    const roleUsers = usersByRole.get(role) || [];
    let met = 0;
    let slots = 0;
    for (const u of roleUsers) {
      const levels = deriveSkillLevels(required, completedByUser.get(String(u._id)) || new Set());
      for (const s of required) {
        slots += 1;
        if ((levels.get(sid(s._id))?.level || 0) >= targetForRole(s, role)) met += 1;
      }
    }
    profiles.push({
      role,
      userCount: roleUsers.length,
      coverage: slots > 0 ? Math.round((met / slots) * 100) : 0,
      skills: required.map((s) => ({ name: s.name, target: targetForRole(s, role) })),
    });
  }
  // Stable order: highest coverage first, then name.
  profiles.sort((a, b) => b.coverage - a.coverage || a.role.localeCompare(b.role));
  return profiles;
};

// ── Learner 360°: derived proficiency + role gap ──────────
const getLearnerSkills = async (userId) => {
  const user = await repository.findUserBasic(userId);
  if (!user) throw new ServiceError('Learner not found', 404);

  const [skills, completed] = await Promise.all([
    repository.listLive(),
    repository.completedProgramIdsForUser(userId),
  ]);
  const levels = deriveSkillLevels(skills, completed);

  // Skills the learner has actually started (level ≥ 1), with the programs that built them.
  const acquired = skills.filter((s) => (levels.get(sid(s._id))?.level || 0) > 0);
  const viaIds = [...new Set(acquired.flatMap((s) => levels.get(sid(s._id)).matchedProgramIds))];
  const programNames = await repository.programNamesByIds(viaIds);

  const acquiredDto = acquired.map((s) => {
    const d = levels.get(sid(s._id));
    return {
      skillId: sid(s._id),
      name: s.name,
      category: s.category || 'General',
      hue: s.hue ?? 250,
      level: d.level,
      max: d.max,
      via: d.matchedProgramIds.map((pid) => programNames.get(pid)).filter(Boolean),
    };
  });

  const gap = roleGap(skills, user.role, levels);
  return {
    learner: { id: String(user._id), name: user.name, role: user.role },
    skills: acquiredDto,
    roleProfile: { role: user.role, required: gap },
    kpis: {
      skills: acquiredDto.length,
      gaps: gap.filter((g) => g.gap > 0).length,
      met: gap.filter((g) => g.gap === 0).length,
    },
  };
};

// ── CRUD ──────────────────────────────────────────────────
const assertNameFree = async (name, excludeId = null) => {
  if (await repository.findByName(name, excludeId)) {
    throw new ServiceError(`A skill named "${name}" already exists`, 409);
  }
};

const createSkill = async (data) => {
  await assertNameFree(data.name);
  const created = await repository.create(data);
  return created.toObject ? created.toObject() : created;
};

const updateSkill = async (id, patch) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Skill not found', 404);
  if (patch.name && patch.name.toLowerCase() !== before.name.toLowerCase()) {
    await assertNameFree(patch.name, id);
  }
  const after = await repository.updateById(id, patch);
  return { before, after };
};

const deleteSkill = async (id) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Skill not found', 404);
  const after = await repository.softDeleteById(id);
  return { before, after };
};

module.exports = {
  listSkills,
  getRoleProfiles,
  getLearnerSkills,
  createSkill,
  updateSkill,
  deleteSkill,
};
