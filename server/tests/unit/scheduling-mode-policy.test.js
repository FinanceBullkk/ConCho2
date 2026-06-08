/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — Scheduling-Mode Policy (Pass C, pure asserts)
 * ──────────────────────────────────────────────────────────
 * The assert fns are pure (mode + actor -> throw/allow), so they are unit-
 * tested here. The resolver (resolveSchedulingMode, DB) is exercised by the
 * legacy-path integration tests.
 * ──────────────────────────────────────────────────────────
 */

const {
  assertTeamMode,
  assertTeamModeStructural,
  assertCohortMode,
  TEAM_SCHEDULING_MODES,
  COHORT_SCHEDULING_MODES,
} = require('../../domains/schedule/scheduling-mode-policy');

const expectThrow = (fn, status, re) => {
  expect(fn).toThrow();
  try {
    fn();
  } catch (e) {
    expect(e.statusCode).toBe(status);
    if (re) expect(e.message).toMatch(re);
  }
};

describe('scheduling-mode-policy · assertTeamModeStructural', () => {
  test('allows team modes', () => {
    expect(() => assertTeamModeStructural({ schedulingMode: 'leader_booking' })).not.toThrow();
    expect(() => assertTeamModeStructural({ schedulingMode: 'admin_scheduled' })).not.toThrow();
  });
  test('rejects cohort modes with 400 (book against the cohort)', () => {
    expectThrow(() => assertTeamModeStructural({ schedulingMode: 'self_enroll' }), 400, /cohort-based/i);
    expectThrow(() => assertTeamModeStructural({ schedulingMode: 'nomination' }), 400, /cohort-based/i);
  });
  test('fails closed (501) for an unknown/future mode', () => {
    expectThrow(() => assertTeamModeStructural({ schedulingMode: 'time_travel' }), 501, /not supported/i);
  });
});

describe('scheduling-mode-policy · assertTeamMode (structural + authz)', () => {
  test('leader_booking is bookable by a non-admin', () => {
    expect(() => assertTeamMode({ schedulingMode: 'leader_booking', actor: { role: 'Participant' } })).not.toThrow();
  });
  test('admin_scheduled is bookable by an Admin', () => {
    expect(() => assertTeamMode({ schedulingMode: 'admin_scheduled', actor: { role: 'Admin' } })).not.toThrow();
  });
  test('admin_scheduled by a non-admin -> 403 (the closed leader bypass)', () => {
    expectThrow(() => assertTeamMode({ schedulingMode: 'admin_scheduled', actor: { role: 'Participant' } }), 403, /admin-scheduled/i);
  });
  test('cohort mode -> 400 even for an Admin (structural fires first)', () => {
    expectThrow(() => assertTeamMode({ schedulingMode: 'self_enroll', actor: { role: 'Admin' } }), 400, /cohort-based/i);
  });
});

describe('scheduling-mode-policy · assertCohortMode', () => {
  test('allows cohort modes', () => {
    expect(() => assertCohortMode({ schedulingMode: 'self_enroll' })).not.toThrow();
    expect(() => assertCohortMode({ schedulingMode: 'nomination' })).not.toThrow();
  });
  test('rejects team modes with 400 (book against the group)', () => {
    expectThrow(() => assertCohortMode({ schedulingMode: 'leader_booking' }), 400, /book against its group/i);
    expectThrow(() => assertCohortMode({ schedulingMode: 'admin_scheduled' }), 400, /book against its group/i);
  });
});

describe('scheduling-mode-policy · mode sets', () => {
  test('team vs cohort sets are disjoint and complete', () => {
    expect([...TEAM_SCHEDULING_MODES]).toEqual(['leader_booking', 'admin_scheduled']);
    expect([...COHORT_SCHEDULING_MODES]).toEqual(['self_enroll', 'nomination']);
  });
});
