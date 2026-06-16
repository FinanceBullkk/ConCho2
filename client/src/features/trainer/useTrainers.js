import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trainersAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// useTrainers — A6 trainer-management depth (Horizon 2). Qualification +
// availability profiles, per-trainer load, ratings. All gated server-side by
// session.assign-trainer (Admin / Coordinator).
// ──────────────────────────────────────────────────────────

const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useTrainers = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.trainer.list(params),
    queryFn: async () => (await trainersAPI.list(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

export const useTrainerLoad = (userId, params = {}, options = {}) =>
  useQuery({
    queryKey: qk.trainer.load(userId, params),
    queryFn: async () => (await trainersAPI.getLoad(userId, params)).data.data,
    enabled: !!userId,
    staleTime: 60_000,
    ...options,
  });

const invalidate = (qc) => qc.invalidateQueries({ queryKey: qk.trainer.all });

export const useUpsertTrainer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }) => trainersAPI.upsert(userId, data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Trainer saved'); },
    onError: onErr,
  });
};

export const useRateTrainer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, value, note }) => trainersAPI.addRating(userId, { value, note }).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Rating recorded'); },
    onError: onErr,
  });
};

export const useArchiveTrainer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId) => trainersAPI.archive(userId).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Trainer profile archived'); },
    onError: onErr,
  });
};
