import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learningAPI } from '../api/api';
import { qk } from './queryKeys';

// 2-tier dashboard hooks. Both bundles are fail-soft per metric: a failed
// block comes back `null` and is listed in `data.errors[]`, so consumers must
// guard each block. Lives in its own file because useLearning.js is at the
// size cap.

export const useOperationalDashboard = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.dashboardOperational(params),
    queryFn: async () => (await learningAPI.getOperationalDashboard(params)).data.data,
    staleTime: 60 * 1000,
    ...options,
  });

// Executive ROI bundle — Admin-only server-side (403 for others).
export const useExecutiveDashboard = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.dashboardExecutive(params),
    queryFn: async () => (await learningAPI.getExecutiveDashboard(params)).data.data,
    staleTime: 60 * 1000,
    ...options,
  });

// Home onboarding checklist + at-a-glance counts (report.read gated).
export const useSetupStatus = (options = {}) =>
  useQuery({
    queryKey: qk.learning.dashboardSetup,
    queryFn: async () => (await learningAPI.getSetup()).data.data,
    staleTime: 5 * 60 * 1000,
    ...options,
  });

export const useCostConfig = (options = {}) =>
  useQuery({
    queryKey: qk.learning.costConfig,
    queryFn: async () => (await learningAPI.getCostConfig()).data.data,
    ...options,
  });

// Saving the cost config changes the executive financials → invalidate both.
export const useSetCostConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.setCostConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.learning.costConfig });
      queryClient.invalidateQueries({ queryKey: ['learning', 'dashboard', 'executive'] });
    },
  });
};
