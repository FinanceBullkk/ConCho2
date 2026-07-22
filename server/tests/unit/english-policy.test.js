const {
  defaultEnglishPolicy,
  normalizeEnglishPolicy,
  assertEnglishProgramConfig,
} = require('../../domains/learning/english-policy');
const {
  createProgramBody,
  createCohortBody,
  updateCohortBody,
  listProgramsQuery,
  listCohortsQuery,
} = require('../../domains/learning/schemas');

describe('typed English learning policy', () => {
  test('accepts nomination plus exactly 13 ordered levels', () => {
    const policy = defaultEnglishPolicy();
    expect(() => assertEnglishProgramConfig({
      category: 'english', schedulingMode: 'nomination', englishPolicy: policy,
    })).not.toThrow();
    expect(createProgramBody.safeParse({
      code: 'ENG_LIVE', name: 'English Live', category: 'english',
      schedulingMode: 'nomination', englishPolicy: policy,
    }).success).toBe(true);
  });

  test('rejects the wrong scheduling mode and duplicate level codes', () => {
    const policy = defaultEnglishPolicy();
    expect(() => assertEnglishProgramConfig({
      category: 'english', schedulingMode: 'admin_scheduled', englishPolicy: policy,
    })).toThrow(/nomination/);
    policy.levelScale[1].code = policy.levelScale[0].code;
    expect(() => assertEnglishProgramConfig({
      category: 'english', schedulingMode: 'nomination', englishPolicy: policy,
    })).toThrow(/unique/);
  });

  test('normalizes level order and validates English cohort run fields', () => {
    const policy = defaultEnglishPolicy();
    policy.levelScale.reverse();
    expect(normalizeEnglishPolicy(policy).levelScale[0].order).toBe(1);
    expect(createCohortBody.safeParse({
      programId: '0123456789abcdef01234567', cohortCode: 'ENG-R1',
      englishGroupCode: 'EL001', teacherIds: ['abcdef0123456789abcdef01'],
      startDate: '2026-07-19', endDate: '2026-08-19',
    }).success).toBe(true);
    expect(updateCohortBody.safeParse({
      englishPicDisplay: 'HR/L&D', startDate: null, endDate: null,
    }).success).toBe(true);
  });

  test('accepts only the explicit live-English list filter', () => {
    expect(listProgramsQuery.parse({ category: 'english', liveEnglish: 'true' }).liveEnglish).toBe(true);
    expect(listCohortsQuery.parse({ category: 'english', liveEnglish: 'true' }).liveEnglish).toBe(true);
    expect(listProgramsQuery.safeParse({ liveEnglish: 'false' }).success).toBe(false);
  });
});
