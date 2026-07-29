import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useEnglishSessionsSummary,
  useEnglishSessionsWindow,
} from '../useEnglishOperations';

const h = vi.hoisted(() => ({ getSessions: vi.fn(), getSessionsSummary: vi.fn() }));

vi.mock('../../../api/api', () => ({
  attendanceAPI: {},
  englishOperationsAPI: {},
  learningAPI: {},
  englishTrainingAPI: { getSessions: h.getSessions, getSessionsSummary: h.getSessionsSummary },
}));

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  h.getSessions.mockReset();
  h.getSessionsSummary.mockReset();
});

describe('useEnglishSessionsWindow', () => {
  it('fetches only the given week — from/to span exactly 7 days — instead of the whole history', async () => {
    h.getSessions.mockResolvedValue({
      data: { success: true, data: [{ id: 'week-row-1' }], count: 1, total: 1 },
    });
    const weekStart = new Date('2026-07-06T00:00:00.000Z');

    const { result } = renderHook(() => useEnglishSessionsWindow(weekStart), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'week-row-1' }]);
    expect(h.getSessions).toHaveBeenCalledTimes(1);
    const [params] = h.getSessions.mock.calls[0];
    expect(params.from).toBe('2026-07-06T00:00:00.000Z');
    expect(params.to).toBe('2026-07-13T00:00:00.000Z');
  });

  it('does not fetch when no week is selected yet', () => {
    renderHook(() => useEnglishSessionsWindow(null), { wrapper: wrapper() });
    expect(h.getSessions).not.toHaveBeenCalled();
  });

  it('caches each week independently — switching weeks re-fetches, returning re-fetches nothing new', async () => {
    h.getSessions.mockImplementation(({ from }) => Promise.resolve({
      data: { success: true, data: [{ id: `row-${from}` }], count: 1, total: 1 },
    }));
    const weekA = new Date('2026-07-06T00:00:00.000Z');
    const weekB = new Date('2026-07-13T00:00:00.000Z');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(
      ({ week }) => useEnglishSessionsWindow(week),
      { wrapper: Wrapper, initialProps: { week: weekA } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ week: weekB });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'row-2026-07-13T00:00:00.000Z' }]));

    rerender({ week: weekA });
    // Back on week A: still cached from the first fetch, no extra call.
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'row-2026-07-06T00:00:00.000Z' }]));
    expect(h.getSessions).toHaveBeenCalledTimes(2);
  });
});

describe('useEnglishSessionsSummary', () => {
  it('returns the global counts/bounds aggregate as-is', async () => {
    const summary = {
      counts: { all: 5, upcoming: 1, recorded: 3, needsEvidence: 1, live: 2, imported: 3 },
      nearestSessionAt: '2026-07-24T02:00:00.000Z',
      latestSessionAt: '2026-08-01T02:00:00.000Z',
      filterSeedAt: {
        all: '2026-07-24T02:00:00.000Z', upcoming: '2026-08-01T02:00:00.000Z',
        recorded: '2026-07-20T02:00:00.000Z', needsEvidence: '2026-07-22T02:00:00.000Z',
      },
    };
    h.getSessionsSummary.mockResolvedValue({ data: { success: true, data: summary } });

    const { result } = renderHook(() => useEnglishSessionsSummary(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(h.getSessionsSummary).toHaveBeenCalledTimes(1);
  });
});
