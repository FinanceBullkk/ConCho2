import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sessionTypesAPI, roomsAPI } from '../../api/api';

// ──────────────────────────────────────────────────────────
// useScheduling — React Query hooks for Studio ▸ Scheduling (Build Plan #5):
// session-type taxonomy (CRUD) + room-utilization analytics. Admin/Coordinator.
// ──────────────────────────────────────────────────────────

const TYPES_KEY = ['session-types'];
const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useSessionTypes = (options = {}) =>
  useQuery({
    queryKey: TYPES_KEY,
    queryFn: async () => (await sessionTypesAPI.list()).data.data,
    ...options,
  });

export const useCreateSessionType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => sessionTypesAPI.create(data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: TYPES_KEY }); toast.success('Session type created'); },
    onError: onErr,
  });
};

export const useUpdateSessionType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => sessionTypesAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: TYPES_KEY }); toast.success('Session type updated'); },
    onError: onErr,
  });
};

export const useArchiveSessionType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => sessionTypesAPI.archive(id).then((r) => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: TYPES_KEY }); toast.success('Session type archived'); },
    onError: onErr,
  });
};

export const useRoomUtilization = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['rooms', 'utilization', params],
    queryFn: async () => (await roomsAPI.getUtilization(params)).data.data,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
