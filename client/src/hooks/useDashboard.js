import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { dashboardAPI } from '../api/api';
import { qk } from './queryKeys';

/**
 * Fetch dashboard stats with optional filters.
 * Query key includes filters so React Query auto-refetches on filter change.
 *
 * UX-01: `placeholderData: keepPreviousData` keeps the previous filter's data
 * visible while the new filter is fetching, so the dashboard never goes blank
 * (i.e. the whole UI does not collapse to a centered spinner on every filter
 * click). The caller can show a subtle "fetching" indicator via `isFetching`.
 */
export const useDashboardStats = (filters = {}, options = {}) => {
  // Strip empty/null values from filters before sending
  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v && v !== '')
  );
  const hasFilters = Object.keys(cleanFilters).length > 0;

  return useQuery({
    queryKey: [...qk.dashboard.stats, cleanFilters],
    queryFn: () => dashboardAPI.getStats(hasFilters ? cleanFilters : undefined).then((r) => r.data.data),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    ...options,
  });
};

/**
 * Fetch available filter options (departments, positions, levels, statuses).
 * Cached aggressively since these rarely change.
 */
export const useDashboardFilterOptions = (options = {}) =>
  useQuery({
    queryKey: [...qk.dashboard.stats, 'filter-options'],
    queryFn: () => dashboardAPI.getFilterOptions().then((r) => r.data.data),
    staleTime: 5 * 60_000, // 5 minutes
    ...options,
  });

/**
 * Fetch actionable alert counts (toMark, teamsWithoutLeader, teamsUnassigned).
 * refetchOnWindowFocus: true — stays fresh as admin switches tabs.
 */
export const useDashboardAlerts = (options = {}) =>
  useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: () => dashboardAPI.getAlerts().then((r) => r.data.data),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    ...options,
  });
