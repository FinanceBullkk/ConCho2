const { classifyDeliveryType } = require('../../domains/schedule/queries');

// Converge Phase 3 slice 4b: every schedule row carries a derived deliveryType
// ('team'|'cohort') world tag so a unified calendar can facet both worlds.
// These pin the pure classifier's edge cases (populated vs id-only classId,
// missing class) without a DB — the end-to-end path is covered in
// tests/integration/scheduleQueries.test.js.
describe('classifyDeliveryType — session world tag', () => {
  const cohortSet = new Set(['c1', 'c2']);

  test('class in the cohort set → "cohort" (populated classId)', () => {
    expect(classifyDeliveryType({ classId: { _id: 'c1' } }, cohortSet)).toBe('cohort');
  });

  test('class in the cohort set → "cohort" (id-only classId)', () => {
    expect(classifyDeliveryType({ classId: 'c2' }, cohortSet)).toBe('cohort');
  });

  test('class NOT in the cohort set → "team" (incl. program-less legacy)', () => {
    expect(classifyDeliveryType({ classId: { _id: 'other' } }, cohortSet)).toBe('team');
    expect(classifyDeliveryType({ classId: 'other' }, cohortSet)).toBe('team');
  });

  test('missing classId → "team" (graceful fallback)', () => {
    expect(classifyDeliveryType({}, cohortSet)).toBe('team');
    expect(classifyDeliveryType({ classId: null }, cohortSet)).toBe('team');
  });

  test('empty cohort set → everything is "team"', () => {
    expect(classifyDeliveryType({ classId: 'c1' }, new Set())).toBe('team');
  });
});
