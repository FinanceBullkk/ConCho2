const { cohortDto } = require('../../domains/learning/dto');

// Converge Phase 3 slice 4: the cohort DTO carries a server-computed
// `deliveryType` ('team' | 'cohort') so ONE catalog can list both scheduling
// worlds and facet by type — derived from the program's schedulingMode via the
// single source of truth, with the program-less fallback to the team world.
const makeCohort = (schedulingMode) => ({
  _id: 'co1',
  classCode: 'X1',
  courseName: 'Course',
  totalSessions: 5,
  status: 'Ongoing',
  programId: schedulingMode ? { _id: 'p1', name: 'Prog', schedulingMode } : null,
});

describe('cohortDto deliveryType', () => {
  test('cohort-mode programs → "cohort"', () => {
    expect(cohortDto(makeCohort('self_enroll')).deliveryType).toBe('cohort');
    expect(cohortDto(makeCohort('nomination')).deliveryType).toBe('cohort');
  });

  test('team-mode programs → "team"', () => {
    expect(cohortDto(makeCohort('leader_booking')).deliveryType).toBe('team');
    expect(cohortDto(makeCohort('admin_scheduled')).deliveryType).toBe('team');
  });

  test('program-less cohort falls back to "team" (matches list-split fallback)', () => {
    expect(cohortDto(makeCohort(null)).deliveryType).toBe('team');
  });

  test('unknown/future mode fails closed to "team" (not in the cohort world)', () => {
    expect(cohortDto(makeCohort('some_future_mode')).deliveryType).toBe('team');
  });

  test('existing fields are preserved (additive change)', () => {
    const dto = cohortDto(makeCohort('self_enroll'));
    expect(dto.cohortCode).toBe('X1');
    expect(dto.programName).toBe('Prog');
    expect(dto.totalSessions).toBe(5);
  });
});
