import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { financeAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// useFinance — A1 budget & cost (Horizon 1). Reads: tenant currency, budget
// variance, cost roll-up. Writes: create budget / cost, archive budget.
// ──────────────────────────────────────────────────────────

const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useTenantCurrency = () =>
  useQuery({
    queryKey: qk.finance.currency,
    queryFn: async () => (await financeAPI.getCurrency()).data.data.currency,
    staleTime: 300_000,
  });

export const useBudgetVariance = (params, options = {}) =>
  useQuery({
    queryKey: qk.finance.variance(params),
    queryFn: async () => (await financeAPI.getBudgetVariance(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

export const useCostRollup = (params, options = {}) =>
  useQuery({
    queryKey: qk.finance.rollup(params),
    queryFn: async () => (await financeAPI.getCostRollup(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

const invalidate = (qc) => qc.invalidateQueries({ queryKey: qk.finance.all });

export const useCreateBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => financeAPI.createBudget(data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Budget created'); },
    onError: onErr,
  });
};

export const useArchiveBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => financeAPI.archiveBudget(id).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Budget archived'); },
    onError: onErr,
  });
};

export const useCreateCostEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => financeAPI.createCostEntry(data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Cost logged'); },
    onError: onErr,
  });
};
