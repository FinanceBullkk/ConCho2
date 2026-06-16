import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { planningAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// usePlanning — A4 TNA → annual plan (Horizon 2). Demand intake + status,
// aggregated demand, and the costed annual plan (+ schedule item → cohort).
// All gated server-side by training.plan (Admin / Coordinator).
// ──────────────────────────────────────────────────────────

const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useTrainingRequests = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.planning.requests(params),
    queryFn: async () => (await planningAPI.listRequests(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

export const useDemand = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.planning.demand(params),
    queryFn: async () => (await planningAPI.getDemand(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

export const useTrainingPlan = (fy, options = {}) =>
  useQuery({
    queryKey: qk.planning.plan(fy),
    queryFn: async () => (await planningAPI.getPlan(fy)).data.data,
    enabled: !!fy,
    staleTime: 60_000,
    ...options,
  });

const invalidate = (qc) => qc.invalidateQueries({ queryKey: qk.planning.all });

export const useCreateRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => planningAPI.createRequest(data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Request submitted'); },
    onError: onErr,
  });
};

export const useSetRequestStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => planningAPI.setRequestStatus(id, status).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Status updated'); },
    onError: onErr,
  });
};

export const useArchiveRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => planningAPI.archiveRequest(id).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Request removed'); },
    onError: onErr,
  });
};

export const useUpsertPlan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fy, items }) => planningAPI.upsertPlan(fy, { items }).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Plan saved'); },
    onError: onErr,
  });
};

export const useScheduleItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fy, itemId, classCode, totalSessions }) =>
      planningAPI.scheduleItem(fy, itemId, { classCode, totalSessions }).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Cohort scheduled'); },
    onError: onErr,
  });
};
