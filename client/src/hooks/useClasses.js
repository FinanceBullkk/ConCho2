import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classesAPI } from '../api/api';
import { qk } from './queryKeys';

// Partial key that matches all class list queries regardless of params
const CLASS_LIST_KEY = ['classes', 'list'];

export const useClasses = (params, options = {}) =>
  useQuery({
    queryKey: qk.classes.list(params),
    queryFn: () => classesAPI.getAll(params).then((r) => r.data.data),
    ...options,
  });

export const useCourses = (options = {}) =>
  useQuery({
    queryKey: qk.classes.courses,
    queryFn: () => classesAPI.getCourses().then((r) => r.data.data),
    staleTime: 5 * 60_000,
    ...options,
  });

export const useClass = (id, options = {}) =>
  useQuery({
    queryKey: qk.classes.detail(id),
    queryFn: () => classesAPI.getById(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

const invalidateClassScopes = (qc) => {
  qc.invalidateQueries({ queryKey: qk.classes.all });
  qc.invalidateQueries({ queryKey: qk.teams.all });
  qc.invalidateQueries({ queryKey: qk.dashboard.stats });
};

export const useCreateClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => classesAPI.create(data).then((r) => r.data.data),
    onSettled: () => invalidateClassScopes(qc),
  });
};

export const useUpdateClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => classesAPI.update(id, data).then((r) => r.data.data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: CLASS_LIST_KEY });
      const previous = qc.getQueriesData({ queryKey: CLASS_LIST_KEY });
      qc.setQueriesData({ queryKey: CLASS_LIST_KEY }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data?.map((c) => (c._id === id ? { ...c, ...data } : c)) ?? [],
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => invalidateClassScopes(qc),
  });
};

export const useDeleteClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => classesAPI.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: CLASS_LIST_KEY });
      const previous = qc.getQueriesData({ queryKey: CLASS_LIST_KEY });
      qc.setQueriesData({ queryKey: CLASS_LIST_KEY }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data?.filter((c) => c._id !== id) ?? [] };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => invalidateClassScopes(qc),
  });
};
