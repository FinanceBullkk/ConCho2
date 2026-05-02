import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classesAPI } from '../api/api';
import { qk } from './queryKeys';

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
    onSuccess: () => invalidateClassScopes(qc),
  });
};

export const useUpdateClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => classesAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => invalidateClassScopes(qc),
  });
};

export const useDeleteClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => classesAPI.delete(id),
    onSuccess: () => invalidateClassScopes(qc),
  });
};
