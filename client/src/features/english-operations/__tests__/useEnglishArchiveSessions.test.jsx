import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCanonicalEnglishEmployees,
  useEnglishArchiveSessions,
} from '../useEnglishOperations';

const h = vi.hoisted(() => ({ getSessions: vi.fn(), getEmployees: vi.fn() }));

vi.mock('../../../api/api', () => ({
  attendanceAPI: {},
  englishOperationsAPI: { getCanonicalEmployees: h.getEmployees },
  learningAPI: {},
  englishTrainingAPI: { getSessions: h.getSessions },
}));

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  h.getSessions.mockReset();
  h.getEmployees.mockReset();
  h.getSessions.mockImplementation(({ limit, offset }) => {
    const total = 984;
    const remaining = Math.max(0, total - offset);
    const count = Math.min(limit, remaining);
    const rows = Array.from({ length: count }, (_, index) => ({ id: `archive-${offset + index}` }));
    // The endpoint reports the full match count so the client can parallelize.
    return Promise.resolve({ data: { success: true, data: rows, total } });
  });
  h.getEmployees.mockImplementation(({ limit, offset }) => {
    const remaining = Math.max(0, 308 - offset);
    const count = Math.min(limit, remaining);
    const rows = Array.from({ length: count }, (_, index) => ({ id: `employee-${offset + index}` }));
    return Promise.resolve({ data: { success: true, data: rows } });
  });
});

describe('useEnglishArchiveSessions', () => {
  it('reads every bounded Archive page so all historical sessions reach the grids', async () => {
    const { result } = renderHook(() => useEnglishArchiveSessions(true), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(984);
    expect(h.getSessions).toHaveBeenCalledTimes(5);
    // Page 0 is fetched first; its `total` drives the remaining offsets, which
    // fire in parallel rather than one serial round-trip each.
    expect(h.getSessions.mock.calls.map(([params]) => params.offset)).toEqual([0, 200, 400, 600, 800]);
  });

  it('stops after one request when a single page covers every session', async () => {
    h.getSessions.mockImplementation(({ limit, offset }) => {
      const total = 12;
      const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) },
        (_, index) => ({ id: `archive-${offset + index}` }));
      return Promise.resolve({ data: { success: true, data: rows, total } });
    });
    const { result } = renderHook(() => useEnglishArchiveSessions(true), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(12);
    expect(h.getSessions).toHaveBeenCalledTimes(1);
  });

  it('loads all canonical Employees instead of truncating the roster picker at 200', async () => {
    const { result } = renderHook(() => useCanonicalEnglishEmployees(true), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(308);
    expect(h.getEmployees.mock.calls.map(([params]) => params.offset)).toEqual([0, 200]);
  });
});
