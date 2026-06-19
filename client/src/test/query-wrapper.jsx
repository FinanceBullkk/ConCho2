import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Test helper: a fresh QueryClient (retries off so failures surface immediately)
// wrapping renderHook. Usage: renderHook(() => useX(), { wrapper: qcWrapper() }).
export function qcWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}
