import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usersAPI } from '../api/api';
import { qk } from './queryKeys';

// Partial key that matches all user list queries regardless of params
const USER_LIST_KEY = ['users', 'list'];

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
    onSuccess: () => toast.success('User created'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.users.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => usersAPI.update(id, data).then((r) => r.data.data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: USER_LIST_KEY });
      const previous = qc.getQueriesData({ queryKey: USER_LIST_KEY });
      qc.setQueriesData({ queryKey: USER_LIST_KEY }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data?.map((u) => (u._id === id ? { ...u, ...data } : u)) ?? [],
        };
      });
      return { previous };
    },
    onSuccess: () => toast.success('User updated'),
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: USER_LIST_KEY });
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
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: USER_LIST_KEY });
      const previous = qc.getQueriesData({ queryKey: USER_LIST_KEY });
      qc.setQueriesData({ queryKey: USER_LIST_KEY }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data?.filter((u) => u._id !== id) ?? [] };
      });
      return { previous };
    },
    onSuccess: () => toast.success('User deleted'),
    onError: (_err, _id, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: USER_LIST_KEY });
      qc.invalidateQueries({ queryKey: qk.teams.all });
    },
  });
};
