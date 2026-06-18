import { describe, expect, it } from 'vitest';
import {
  TEAM_BOOKABLE_MODE,
  COHORT_SCHEDULING_MODES,
  isCohortMode,
  effectiveSchedulingMode,
  isLeaderBookable,
  lockedReason,
} from '../scheduling-mode';

const teamWithMode = (schedulingMode) => ({
  _id: 't1',
  classId: { _id: 'c1', programId: { _id: 'p1', schedulingMode } },
});

describe('effectiveSchedulingMode', () => {
  it('returns the linked program mode verbatim', () => {
    expect(effectiveSchedulingMode(teamWithMode('admin_scheduled'))).toBe('admin_scheduled');
    expect(effectiveSchedulingMode(teamWithMode('leader_booking'))).toBe('leader_booking');
    expect(effectiveSchedulingMode(teamWithMode('self_enroll'))).toBe('self_enroll');
  });

  it('passes unknown/future modes through so callers can branch', () => {
    expect(effectiveSchedulingMode(teamWithMode('some_future_mode'))).toBe('some_future_mode');
  });

  it('falls back to leader_booking when no program is linked (matches server)', () => {
    expect(effectiveSchedulingMode({ classId: { programId: null } })).toBe(TEAM_BOOKABLE_MODE);
    expect(effectiveSchedulingMode({ classId: {} })).toBe(TEAM_BOOKABLE_MODE);
    expect(effectiveSchedulingMode({ classId: null })).toBe(TEAM_BOOKABLE_MODE);
    expect(effectiveSchedulingMode({})).toBe(TEAM_BOOKABLE_MODE);
    expect(effectiveSchedulingMode(undefined)).toBe(TEAM_BOOKABLE_MODE);
  });
});

describe('isLeaderBookable', () => {
  it('is true only for leader_booking', () => {
    expect(isLeaderBookable(teamWithMode('leader_booking'))).toBe(true);
    expect(isLeaderBookable({ classId: { programId: null } })).toBe(true); // fallback
  });

  it('is false for admin_scheduled and cohort modes', () => {
    expect(isLeaderBookable(teamWithMode('admin_scheduled'))).toBe(false);
    expect(isLeaderBookable(teamWithMode('self_enroll'))).toBe(false);
    expect(isLeaderBookable(teamWithMode('nomination'))).toBe(false);
    expect(isLeaderBookable(teamWithMode('some_future_mode'))).toBe(false);
  });
});

describe('isCohortMode (client single source of truth)', () => {
  it('is true for the cohort modes only', () => {
    expect(isCohortMode('self_enroll')).toBe(true);
    expect(isCohortMode('nomination')).toBe(true);
    expect(isCohortMode('leader_booking')).toBe(false);
    expect(isCohortMode('admin_scheduled')).toBe(false);
    expect(isCohortMode('some_future_mode')).toBe(false);
    expect(isCohortMode(undefined)).toBe(false);
  });

  it('exposes the canonical cohort-mode list', () => {
    expect(COHORT_SCHEDULING_MODES).toEqual(['self_enroll', 'nomination']);
  });
});

describe('lockedReason', () => {
  it('maps admin_scheduled → adminScheduled', () => {
    expect(lockedReason('admin_scheduled')).toBe('adminScheduled');
  });

  it('maps cohort modes → cohort', () => {
    expect(lockedReason('self_enroll')).toBe('cohort');
    expect(lockedReason('nomination')).toBe('cohort');
  });

  it('maps anything else → generic', () => {
    expect(lockedReason('some_future_mode')).toBe('generic');
    expect(lockedReason(undefined)).toBe('generic');
    // leader_booking is never shown (banner only renders when !bookable) but
    // still resolves safely.
    expect(lockedReason('leader_booking')).toBe('generic');
  });
});
