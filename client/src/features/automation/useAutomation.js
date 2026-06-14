import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// No-code automation rules (TMS.update gap #3). `{ rules, triggers, actionTypes }`.
export function useAutomationRules(options = {}) {
  return useQuery({
    queryKey: qk.automation.rules,
    queryFn: async () => (await automationAPI.listRules()).data.data,
    ...options,
  });
}

const invalidate = (qc) => qc.invalidateQueries({ queryKey: qk.automation.rules });

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => automationAPI.createRule(data).then((r) => r.data.data),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => automationAPI.updateRule(id, data).then((r) => r.data.data),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => automationAPI.deleteRule(id).then((r) => r.data.data),
    onSuccess: () => invalidate(qc),
  });
}
