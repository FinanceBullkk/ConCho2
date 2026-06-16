const { deriveSkillLevels, targetForRole, roleGap, recommendPrograms } = require('../../domains/skill/proficiency');

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

describe('skill recommendations (recommendPrograms)', () => {
  // Two gapped skills (Sa needs p1, Sb needs p2/p3); p2 builds BOTH Sa and Sb.
  const skills = [
    mkSkill('a', ['p1', 'p2'], { Participant: 2 }), // level 0 → gap 2
    mkSkill('b', ['p2', 'p3'], { Participant: 1 }), // level 0 → gap 1
    mkSkill('c', ['p4'], { Teacher: 2 }),           // not required for Participant
  ];
  const names = new Map([['p1', 'P1'], ['p2', 'P2'], ['p3', 'P3']]); // p4 omitted (inactive)

  it('ranks programs by how many gapped role-skills they advance', () => {
    const levels = deriveSkillLevels(skills, new Set());
    const recs = recommendPrograms(skills, 'Participant', levels, new Set(), names);
    // p2 advances BOTH Sa and Sb → top; p1 + p3 advance one each.
    expect(recs[0]).toMatchObject({ programId: 'p2', gapClosed: 2 });
    expect(recs[0].skills.map((s) => s.name).sort()).toEqual(['Sa', 'Sb']);
    expect(recs.map((r) => r.programId)).toEqual(['p2', 'p1', 'p3']); // tie p1/p3 break on name
  });

  it('excludes completed programs and programs not in the active-name map', () => {
    const levels = deriveSkillLevels(skills, new Set(['p1'])); // p1 done → Sa level 1 (still gap 1)
    const recs = recommendPrograms(skills, 'Participant', levels, new Set(['p1']), names);
    expect(recs.find((r) => r.programId === 'p1')).toBeUndefined(); // completed
    expect(recs.find((r) => r.programId === 'p4')).toBeUndefined(); // inactive (absent from names)
  });

  it('returns nothing when the role has no gaps', () => {
    const levels = deriveSkillLevels(skills, new Set(['p1', 'p2', 'p3'])); // both skills met
    expect(recommendPrograms(skills, 'Participant', levels, new Set(['p1', 'p2', 'p3']), names)).toEqual([]);
  });
});
