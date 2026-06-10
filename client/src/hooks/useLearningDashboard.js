import { useQuery } from '@tanstack/react-query';
import { learningAPI } from '../api/api';
import { qk } from './queryKeys';

// Operational dashboard KPI bundle (2-tier dashboard — Phase 2 client).
// The endpoint is fail-soft per metric: a failed block comes back `null` and
// is listed in `data.errors[]`, so consumers must guard each block.
// Lives in its own hook file because useLearning.js is at the size cap.
export const useOperationalDashboard = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.dashboardOperational(params),
    queryFn: async () => (await learningAPI.getOperationalDashboard(params)).data.data,
    staleTime: 60 * 1000,
    ...options,
  });
