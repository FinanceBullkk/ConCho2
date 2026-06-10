import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { roomsAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// useRooms — React Query hooks for Office-scoped Rooms
// (re-center Phase 3). Admin/Coordinator only (scheduling tools).
// Pass { officeId } to scope the list to one office (the picker).
// ──────────────────────────────────────────────────────────

export const useRooms = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.rooms.list(params),
    queryFn: async () => (await roomsAPI.getRooms(params)).data.data,
    ...options,
  });

const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useCreateRoom = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => roomsAPI.createRoom(data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rooms.all });
      toast.success('Room created');
    },
    onError: onErr,
  });
};

export const useUpdateRoom = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => roomsAPI.updateRoom(id, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rooms.all });
      toast.success('Room updated');
    },
    onError: onErr,
  });
};

export const useArchiveRoom = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => roomsAPI.archiveRoom(id).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rooms.all });
      toast.success('Room archived');
    },
    onError: onErr,
  });
};
