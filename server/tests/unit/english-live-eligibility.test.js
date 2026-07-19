const { computeEligibility } = require('../../domains/english-training/live-eligibility');

const sessions = [1, 2, 3, 4].map((sessionNumber) => ({
  id: `s${sessionNumber}`, sessionNumber, status: 'scheduled',
}));
const policy = { maxAbsencesAllowed: 2, absenceStatuses: ['A'] };
const marks = (statuses) => statuses.map((status, index) => ({
  scheduleId: `s${index + 1}`, status,
}));

describe('live English eligibility contract', () => {
  test('allowance boundary remains eligible and allowance + 1 is not eligible', () => {
    expect(computeEligibility({ policy, cohortStatus: 'Completed', sessions, marks: marks(['A', 'A', 'P', 'P']) }).status)
      .toBe('eligible');
    expect(computeEligibility({ policy, cohortStatus: 'Completed', sessions, marks: marks(['A', 'A', 'A', 'P']) }).status)
      .toBe('not_eligible');
  });

  test('late and excused do not count when only A is configured absent', () => {
    const result = computeEligibility({ policy, cohortStatus: 'Completed', sessions, marks: marks(['L', 'EL', 'A', 'P']) });
    expect(result.absenceCount).toBe(1);
    expect(result.status).toBe('eligible');
  });

  test('pre-join sessions are not applicable rather than unmarked', () => {
    const result = computeEligibility({
      policy,
      cohortStatus: 'Completed',
      startSessionNumber: 3,
      sessions,
      marks: [{ scheduleId: 's3', status: 'P' }, { scheduleId: 's4', status: 'P' }],
    });
    expect(result).toMatchObject({ expectedCount: 2, markedCount: 2, unmarkedCount: 0, notApplicableCount: 2 });
  });

  test('completed run with missing marks is incomplete', () => {
    const result = computeEligibility({ policy, cohortStatus: 'Completed', sessions, marks: marks(['P']) });
    expect(result).toMatchObject({ status: 'incomplete', unmarkedCount: 3 });
  });
});
