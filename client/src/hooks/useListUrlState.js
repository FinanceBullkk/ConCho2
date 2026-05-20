import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from './useDebounce';

// ──────────────────────────────────────────────────────────
// useListUrlState — Phase 3 Screen 5 §F
//
// Reusable URL ↔ list state for canonical list pages. Replaces
// the per-page bespoke `searchParams.get(...) + setParam(...)` blocks
// across UsersPage, TeamsPage, ClassesPage, CourseManager.
//
// Per the Screen 5 contract:
//   • All filter state lives in the URL (reload preserves, share works)
//   • Changing any filter resets page → 1
//   • Search is debounced 300ms before being used as a query input
//
// Usage:
//   const list = useListUrlState({
//     defaults: { sortBy: 'updatedAt', sortOrder: 'desc' },
//     facets: ['role', 'bu', 'level'],  // multi-value facets
//   });
//   list.search           // raw search input
//   list.debouncedSearch  // 300ms-debounced (for query)
//   list.status           // single-value primary status filter
//   list.facets.role      // string ('' = no filter)
//   list.sortBy, list.sortOrder
//   list.page             // 1-based
//
//   list.setSearch(v)            // updates ?search=
//   list.setStatus(v)            // updates ?status= (toggles off if same)
//   list.setFacet('role', v)     // updates ?role=
//   list.setSort(col)            // toggles ASC ↔ DESC
//   list.setPage(p)
//   list.clearAll()              // removes every list param
//   list.queryParams             // object ready for API hook
//   list.activeFilterChips       // [{key, label, onRemove}] for FilterChips
// ──────────────────────────────────────────────────────────

const RESERVED = new Set(['search', 'status', 'sortBy', 'sortOrder', 'page', 'tab']);

export function useListUrlState({
  defaults = {},
  facets   = [],
  debounceMs = 300,
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Read state ─────────────────────────────────────────
  const search      = searchParams.get('search')    ?? '';
  const status      = searchParams.get('status')    ?? (defaults.status ?? '');
  const sortBy      = searchParams.get('sortBy')    ?? (defaults.sortBy ?? '');
  const sortOrder   = searchParams.get('sortOrder') ?? (defaults.sortOrder ?? 'desc');
  const page        = Number(searchParams.get('page') ?? '1') || 1;
  const debouncedSearch = useDebounce(search, debounceMs);

  const facetValues = useMemo(() => {
    const out = {};
    for (const key of facets) out[key] = searchParams.get(key) ?? '';
    return out;
  }, [facets, searchParams]);

  // ── Write helpers ──────────────────────────────────────
  // Setting any non-page param resets page=1.
  const setParam = useCallback((key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setSearch = useCallback((v) => setParam('search', v), [setParam]);

  // Status chip behavior: clicking active chip clears it.
  const setStatus = useCallback((v) => {
    setParam('status', v === status ? '' : v);
  }, [setParam, status]);

  const setFacet = useCallback((key, v) => setParam(key, v), [setParam]);

  const setSort = useCallback((col) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const curCol   = next.get('sortBy');
      const curOrder = next.get('sortOrder') || 'desc';
      if (curCol === col) {
        next.set('sortOrder', curOrder === 'asc' ? 'desc' : 'asc');
      } else {
        next.set('sortBy', col);
        next.set('sortOrder', 'asc');
      }
      next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setPage = useCallback((p) => setParam('page', p > 1 ? String(p) : ''), [setParam]);

  const clearAll = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of [...next.keys()]) {
        if (RESERVED.has(k) || facets.includes(k)) next.delete(k);
      }
      return next;
    }, { replace: true });
  }, [facets, setSearchParams]);

  // ── Derived ────────────────────────────────────────────
  const queryParams = useMemo(() => {
    const params = { page, sortBy, sortOrder };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (status) params.status = status;
    for (const [k, v] of Object.entries(facetValues)) {
      if (v) params[k] = v;
    }
    return params;
  }, [page, sortBy, sortOrder, debouncedSearch, status, facetValues]);

  const hasActiveFilters = useMemo(
    () => !!(search || status || Object.values(facetValues).some(Boolean)),
    [search, status, facetValues],
  );

  return {
    // raw state
    search, debouncedSearch, status, facets: facetValues,
    sortBy, sortOrder, page,

    // writers
    setSearch, setStatus, setFacet, setSort, setPage, setParam, clearAll,

    // derived
    queryParams,
    hasActiveFilters,
  };
}
