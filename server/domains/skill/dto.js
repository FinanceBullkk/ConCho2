// Response shaping for the skill domain (TMS.update gap #4).

/** A skill row for the Studio grid: identity + mapping + coverage. */
const skillDto = (skill, holders = 0) => ({
  id: String(skill._id),
  _id: String(skill._id),
  name: skill.name,
  category: skill.category || 'General',
  hue: skill.hue ?? 250,
  programIds: (skill.programIds || []).map((p) => String(p)),
  programCount: (skill.programIds || []).length,
  maxLevel: skill.maxLevel || 5,
  targetByRole: skill.targetByRole || {},
  coverageTarget: skill.coverageTarget ?? null,
  holders,
  coveragePct: skill.coverageTarget ? Math.round((holders / skill.coverageTarget) * 100) : null,
});

module.exports = { skillDto };
