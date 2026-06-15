const { deriveSkillLevels, targetForRole, roleGap } = require('../../domains/skill/proficiency');

// Pure proficiency derivation (TMS.update gap #4) — no DB/request.

const mkSkill = (id, programIds, targetByRole = {}, maxLevel = 5) => ({
  _id: id, name: `S${id}`, programIds, targetByRole, maxLevel,
});

describe('skill proficiency derivation', () => {
  it('counts completed contributing programs as level, capped at maxLevel', () => {
    const skills = [
      mkSkill('a', ['p1', 'p2', 'p3'], {}, 2), // 3 matched but cap 2
      mkSkill('b', ['p4'], {}, 5),              // 0 matched
    ];
    const completed = new Set(['p1', 'p2', 'p3', 'p9']);
    const levels = deriveSkillLevels(skills, completed);
    expect(levels.get('a').level).toBe(2); // capped
    expect(levels.get('a').matchedProgramIds).toEqual(['p1', 'p2', 'p3']);
    expect(levels.get('b').level).toBe(0);
  });

  it('targetForRole reads the role key, treating absent/0 as not-required', () => {
    const s = mkSkill('a', [], { Participant: 3, Teacher: 0 });
    expect(targetForRole(s, 'Participant')).toBe(3);
    expect(targetForRole(s, 'Teacher')).toBe(0);
    expect(targetForRole(s, 'Admin')).toBe(0);
  });

  it('roleGap returns only required skills with gap = max(0, target - level)', () => {
    const skills = [
      mkSkill('a', ['p1'], { Participant: 3 }),  // level 1 → gap 2
      mkSkill('b', ['p2'], { Participant: 1 }),  // level 1 → gap 0
      mkSkill('c', ['p3'], { Teacher: 2 }),      // not required for Participant
    ];
    const levels = deriveSkillLevels(skills, new Set(['p1', 'p2']));
    const gap = roleGap(skills, 'Participant', levels);
    expect(gap).toHaveLength(2);
    expect(gap.find((g) => g.name === 'Sa')).toMatchObject({ target: 3, level: 1, gap: 2 });
    expect(gap.find((g) => g.name === 'Sb')).toMatchObject({ target: 1, level: 1, gap: 0 });
  });
});
