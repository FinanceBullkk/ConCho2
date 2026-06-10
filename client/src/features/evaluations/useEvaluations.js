import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { evaluationsAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

export const useEvaluations = (params, options = {}) =>
  useQuery({
    queryKey: qk.evaluations.list(params),
    queryFn: () => evaluationsAPI.getAll(params).then((r) => r.data.data),
    ...options,
  });

export const useEvaluation = (id, options = {}) =>
  useQuery({
    queryKey: qk.evaluations.detail(id),
    queryFn: () => evaluationsAPI.getById(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export const useUpsertEvaluation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => evaluationsAPI.upsert(data).then((r) => r.data.data),
    onSuccess: () => { toast.success('Evaluation saved'); qc.invalidateQueries({ queryKey: qk.evaluations.all }); },
  });
};

export const useDeleteEvaluation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => evaluationsAPI.delete(id),
    onSuccess: () => { toast.success('Evaluation deleted'); qc.invalidateQueries({ queryKey: qk.evaluations.all }); },
  });
};
