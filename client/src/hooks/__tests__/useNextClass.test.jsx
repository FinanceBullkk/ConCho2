import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// useNextClass derives state purely from useMyClassSchedules — mock that data
// source so the derivation (sort asc, "future" filter vs now, top-5 slice,
// passthrough of team/leader/loading) is exercised deterministically without
// touching the network or the 60s drift interval.
vi.mock('../useSchedules', () => ({ useMyClassSchedules: vi.fn() }));
import { useMyClassSchedules } from '../useSchedules';
import { useNextClass } from '../useNextClass';

const NOW = Date.now();
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const PAST = iso(-86_400_000);   // yesterday
const SOON = iso(60 * 60_000);   // +1h
const LATER = iso(120 * 60_000); // +2h

const mockReturn = (over = {}) =>
  useMyClassSchedules.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...over,
  });

describe('useNextClass', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the earliest future session and sorts the full list ascending', () => {
    mockReturn({
      data: {
        data: [{ _id: 'late', startTime: LATER }, { _id: 'old', startTime: PAST }, { _id: 'soon', startTime: SOON }],
        team: 'Team Alpha',
        leader: { _id: 'l1', name: 'Lead' },
      },
    });
    const { result } = renderHook(() => useNextClass());
    expect(result.current.nextClass._id).toBe('soon');
    expect(result.current.schedules.map((s) => s._id)).toEqual(['old', 'soon', 'late']);
    expect(result.current.team).toBe('Team Alpha');
    expect(result.current.leader.name).toBe('Lead');
  });

  it('caps "upcoming" at the next 5 future sessions', () => {
    const data = Array.from({ length: 7 }, (_, i) => ({ _id: `s${i}`, startTime: iso((i + 1) * 60_000) }));
    mockReturn({ data: { data, team: 'T', leader: null } });
    const { result } = renderHook(() => useNextClass());
    expect(result.current.upcoming).toHaveLength(5);
    expect(result.current.upcoming[0]._id).toBe('s0');
  });

  it('excludes past sessions from nextClass and upcoming', () => {
    mockReturn({ data: { data: [{ _id: 'old', startTime: PAST }], team: 'T', leader: null } });
    const { result } = renderHook(() => useNextClass());
    expect(result.current.nextClass).toBeNull();
    expect(result.current.upcoming).toHaveLength(0);
    expect(result.current.schedules).toHaveLength(1); // history still listed
  });

  it('returns empty state when there is no data', () => {
    mockReturn();
    const { result } = renderHook(() => useNextClass());
    expect(result.current.nextClass).toBeNull();
    expect(result.current.upcoming).toEqual([]);
    expect(result.current.schedules).toEqual([]);
    expect(result.current.team).toBeNull();
  });

  it('passes through loading and error flags from the data source', () => {
    mockReturn({ isLoading: true });
    const { result, rerender } = renderHook(() => useNextClass());
    expect(result.current.isLoading).toBe(true);

    const err = new Error('boom');
    mockReturn({ isError: true, error: err });
    rerender();
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(err);
  });
});
