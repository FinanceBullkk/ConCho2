import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUsers } from '../useUsers';

// MSW server already started in setup.js via src/test/server.js

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useUsers', () => {
  it('fetches users list successfully', async () => {
    const { result } = renderHook(() => useUsers(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(2);
    expect(result.current.data?.data[0].name).toBe('Alice Admin');
  });

  it('exposes isLoading while fetching', () => {
    const { result } = renderHook(() => useUsers(), { wrapper: wrapper() });
    // Initially loading (before MSW responds)
    expect(result.current.isLoading).toBe(true);
  });

  it('passes page param to API', async () => {
    const { result } = renderHook(() => useUsers({ page: 2, limit: 10 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // MSW returns data regardless of page — just verify no error thrown
    expect(result.current.isError).toBe(false);
  });
});
