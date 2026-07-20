import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnglishArchiveSessions } from '../useEnglishOperations';

const h = vi.hoisted(() => ({ getSessions: vi.fn() }));

vi.mock('../../../api/api', () => ({
  attendanceAPI: {},
  englishOperationsAPI: {},
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
  h.getSessions.mockImplementation(({ limit, offset }) => {
    const remaining = Math.max(0, 984 - offset);
    const count = Math.min(limit, remaining);
    const rows = Array.from({ length: count }, (_, index) => ({ id: `archive-${offset + index}` }));
    return Promise.resolve({ data: { success: true, data: rows } });
  });
});

describe('useEnglishArchiveSessions', () => {
  it('reads every bounded Archive page so all historical sessions reach the grids', async () => {
    const { result } = renderHook(() => useEnglishArchiveSessions(true), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(984);
    expect(h.getSessions).toHaveBeenCalledTimes(5);
    expect(h.getSessions.mock.calls.map(([params]) => params.offset)).toEqual([0, 200, 400, 600, 800]);
  });
});
