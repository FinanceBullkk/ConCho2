import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersAPI } from '../api/api';
import { qk } from './queryKeys';

const unwrap = (res) => res.data;

export const useUsers = (params, options = {}) =>
  useQuery({
    queryKey: qk.users.list(params),
    queryFn: () => usersAPI.getAll(params).then(unwrap),
    ...options,
  });

export const useUser = (id, options = {}) =>
  useQuery({
    queryKey: qk.users.detail(id),
    queryFn: () => usersAPI.getById(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export const useUserProgress = (id, options = {}) =>
  useQuery({
    queryKey: qk.users.progress(id),
    queryFn: () => usersAPI.getProgress(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => usersAPI.create(data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => usersAPI.update(id, data).then((r) => r.data.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.users.all });
      qc.invalidateQueries({ queryKey: qk.users.detail(vars.id) });
      qc.invalidateQueries({ queryKey: qk.teams.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => usersAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users.all });
      qc.invalidateQueries({ queryKey: qk.teams.all });
    },
  });
};
