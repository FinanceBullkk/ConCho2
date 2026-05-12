import { useQuery } from '@tanstack/react-query';
import { searchAPI } from '../api/api';
import { qk } from './queryKeys';
import { useDebounce } from './useDebounce';

/**
 * useGlobalSearch — debounced cross-entity search hook.
 *
 * - Debounces the user's typing (250ms) so we don't hammer the API.
 * - Disables the query when the (debounced) query string is < 2 chars,
 *   matching the backend's minimum.
 * - 30s stale time — search results don't change minute-to-minute, and
 *   the cache hit is great UX when the user reopens the palette with
 *   the same query.
 */
export function useGlobalSearch(query, { limit = 5 } = {}) {
  const debounced = useDebounce(query, 250);
  const trimmed = (debounced || '').trim();

  return useQuery({
    queryKey: qk.search.global(`${trimmed}|${limit}`),
    queryFn: () => searchAPI.global(trimmed, limit).then((r) => r.data.data),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    // Show last data while refetching so the dropdown doesn't blink empty
    // between keystrokes.
    placeholderData: (prev) => prev,
  });
}
