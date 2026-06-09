/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — Session Booking Policy (pure helpers)
 * ──────────────────────────────────────────────────────────
 * getWeekBounds + snapshotActiveMembers are pure (no DB), so they are unit-
 * tested directly here. assertBookable's weekly-cap / collision behaviour is
 * exercised against a real DB by the integration suites (booking, bookingRace,
 * scheduleReassign).
 * ──────────────────────────────────────────────────────────
 */

const {
  getWeekBounds,
  snapshotActiveMembers,
  effectiveSessionCapacity,
  capacityMessage,
  WEEKLY_TEAM_LIMIT,
  DEFAULT_SESSION_CAPACITY,
} = require('../../domains/schedule/session-booking-policy');

describe('session-booking-policy · getWeekBounds', () => {
  test('a mid-week day maps to Mon 00:00:00.000 — Sun 23:59:59.999 UTC', () => {
    // 2026-06-10 is a Wednesday.
    const { weekStart, weekEnd } = getWeekBounds(new Date('2026-06-10T09:30:00.000Z'));
    expect(weekStart.toISOString()).toBe('2026-06-08T00:00:00.000Z'); // Monday
    expect(weekEnd.toISOString()).toBe('2026-06-14T23:59:59.999Z');   // Sunday
  });

  test('Sunday belongs to the week that started the previous Monday', () => {
    // 2026-06-14 is a Sunday — the dayOfWeek===0 wrap-around case.
    const { weekStart, weekEnd } = getWeekBounds(new Date('2026-06-14T22:00:00.000Z'));
    expect(weekStart.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(weekEnd.toISOString()).toBe('2026-06-14T23:59:59.999Z');
  });

  test('Monday is its own week start', () => {
    const { weekStart } = getWeekBounds(new Date('2026-06-08T00:00:00.000Z'));
    expect(weekStart.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });
});

describe('session-booking-policy · snapshotActiveMembers', () => {
  test('keeps only Active members and returns their ids', () => {
    const team = {
      members: [
        { _id: 'a', status: 'Active' },
        { _id: 'b', status: 'Dropped' },
        { _id: 'c', status: 'Active' },
        { _id: 'd', status: 'Inactive' },
      ],
    };
    expect(snapshotActiveMembers(team)).toEqual(['a', 'c']);
  });

  test('tolerates a missing team, missing members, and null entries', () => {
    expect(snapshotActiveMembers(undefined)).toEqual([]);
    expect(snapshotActiveMembers({})).toEqual([]);
    expect(snapshotActiveMembers({ members: [null, { _id: 'x', status: 'Active' }] })).toEqual(['x']);
  });
});

describe('session-booking-policy · WEEKLY_TEAM_LIMIT', () => {
  test('is re-exported from the scheduling-window policy (single source)', () => {
    expect(WEEKLY_TEAM_LIMIT).toBe(2);
  });
});

describe('session-booking-policy · effectiveSessionCapacity (Wave E2)', () => {
  test('program maxParticipantsPerSession overrides the per-session field', () => {
    expect(effectiveSessionCapacity({ scheduleCapacity: 9, maxPerSession: 20 })).toBe(20);
  });

  test('falls back to the Schedule.capacity field when no program cap', () => {
    expect(effectiveSessionCapacity({ scheduleCapacity: 15, maxPerSession: null })).toBe(15);
  });

  test('falls back to the default when neither is set', () => {
    expect(effectiveSessionCapacity({})).toBe(DEFAULT_SESSION_CAPACITY);
    expect(effectiveSessionCapacity({ scheduleCapacity: null, maxPerSession: null })).toBe(9);
  });
});

describe('session-booking-policy · capacityMessage', () => {
  test('embeds the cap and keeps the bilingual contract substring', () => {
    expect(capacityMessage(9)).toMatch(/sức chứa/);
    expect(capacityMessage(9)).toMatch(/\b9\b/);
  });
});
