import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
    onSuccess: () => toast.success('Class created'),
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
      // BUG #5 fix: `useClasses` queryFn returns `r.data.data` (the array),
      // so the cached value IS the array — not an envelope. The previous
      // code did `old.data?.map(...)` which made the cache `{ data: [] }`
      // and collapsed the ClassesPage matrix to "No cohorts".
      qc.setQueriesData({ queryKey: CLASS_LIST_KEY }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((c) => (c._id === id ? { ...c, ...data } : c));
      });
      return { previous };
    },
    onSuccess: () => toast.success('Class updated'),
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
      // Same BUG #5 fix — operate on the array directly.
      qc.setQueriesData({ queryKey: CLASS_LIST_KEY }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((c) => c._id !== id);
      });
      return { previous };
    },
    onSuccess: () => toast.success('Class deleted'),
    onError: (_err, _id, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => invalidateClassScopes(qc),
  });
};
