import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ──────────────────────────────────────────────────────────
// Mutation policy (audit PR K — FE-005)
//
// `retry: false` for mutations — never auto-retry a write. The server is
// the authority on idempotency, and retrying a non-idempotent POST that
// partially succeeded duplicates work (extra DB rows, extra emails, etc.).
//
// The default `onError` toast acts as a SAFETY-NET only; it's suppressed
// when:
//   • status is 401 (auth interceptor handles redirect → don't double-toast)
//   • the mutation explicitly sets `meta: { suppressGlobalErrorToast: true }`
//     so a hook-level onError can show its own contextual message without
//     racing with this one.
// ──────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
      onError: (error, _variables, _context, mutation) => {
        if (mutation?.meta?.suppressGlobalErrorToast) return;
        if (error?.response?.status === 401) return;
        const msg = error?.response?.data?.message || error?.message || 'Request failed';
        toast.error(msg);
      },
    },
  },
});
