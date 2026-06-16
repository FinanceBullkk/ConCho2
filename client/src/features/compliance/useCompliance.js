import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { complianceAPI } from '../../api/api';

// ──────────────────────────────────────────────────────────
// useCompliance — A3 required-training rules + derived matrix (Horizon 1).
// ──────────────────────────────────────────────────────────

const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useComplianceMatrix = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['compliance', 'matrix', params],
    queryFn: async () => (await complianceAPI.getMatrix(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

const invalidate = (qc) => qc.invalidateQueries({ queryKey: ['compliance'] });

export const useCreateRequirement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => complianceAPI.createRequirement(data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Requirement created'); },
    onError: onErr,
  });
};

export const useArchiveRequirement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => complianceAPI.archiveRequirement(id).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Requirement archived'); },
    onError: onErr,
  });
};
