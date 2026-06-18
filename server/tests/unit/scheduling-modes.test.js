const modes = require('../../domains/_shared/scheduling-modes');
const policy = require('../../domains/schedule/scheduling-mode-policy');

// Converge Phase 3 slice 1: the team/cohort classification now lives in ONE
// leaf module. These tests pin its contents AND prove the policy layer (which
// gates booking authz) derives from the same source — so the consolidation is
// behaviour-preserving (parity), not a silent change.
describe('scheduling-modes — single source of truth', () => {
  test('team + cohort sets have exactly the expected modes', () => {
    expect(modes.TEAM_SCHEDULING_MODES).toEqual(['leader_booking', 'admin_scheduled']);
    expect(modes.COHORT_SCHEDULING_MODES).toEqual(['self_enroll', 'nomination']);
  });

  test('ALL = team ∪ cohort, with no overlap', () => {
    expect(modes.ALL_SCHEDULING_MODES).toEqual([
      'leader_booking', 'admin_scheduled', 'self_enroll', 'nomination',
    ]);
    const overlap = modes.TEAM_SCHEDULING_MODES.filter((m) =>
      modes.COHORT_SCHEDULING_MODES.includes(m));
    expect(overlap).toEqual([]);
  });

  test('predicates classify each mode correctly', () => {
    expect(modes.isCohortMode('self_enroll')).toBe(true);
    expect(modes.isCohortMode('nomination')).toBe(true);
    expect(modes.isCohortMode('leader_booking')).toBe(false);
    expect(modes.isTeamMode('admin_scheduled')).toBe(true);
    expect(modes.isTeamMode('self_enroll')).toBe(false);
    expect(modes.isCohortMode('nonsense')).toBe(false);
    expect(modes.isTeamMode('nonsense')).toBe(false);
  });

  test('the sets are frozen (cannot be mutated by a consumer)', () => {
    expect(Object.isFrozen(modes.COHORT_SCHEDULING_MODES)).toBe(true);
    expect(Object.isFrozen(modes.TEAM_SCHEDULING_MODES)).toBe(true);
  });

  test('scheduling-mode-policy re-exports the SAME classification (parity)', () => {
    expect([...policy.COHORT_SCHEDULING_MODES].sort())
      .toEqual([...modes.COHORT_SCHEDULING_MODES].sort());
    expect([...policy.TEAM_SCHEDULING_MODES].sort())
      .toEqual([...modes.TEAM_SCHEDULING_MODES].sort());
  });
});
