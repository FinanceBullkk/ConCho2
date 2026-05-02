import { useQuery } from '@tanstack/react-query';
import { dashboardAPI } from '../api/api';
import { qk } from './queryKeys';

export const useDashboardStats = (options = {}) =>
  useQuery({
    queryKey: qk.dashboard.stats,
    queryFn: () => dashboardAPI.getStats().then((r) => r.data.data),
    staleTime: 60_000,
    ...options,
  });
