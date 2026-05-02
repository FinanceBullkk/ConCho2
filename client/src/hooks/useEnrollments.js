import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enrollmentsAPI } from '../api/api';
import { qk } from './queryKeys';

export const useEnrollments = (params, options = {}) =>
  useQuery({
    queryKey: qk.enrollments.list(params),
    queryFn: () => enrollmentsAPI.getAll(params).then((r) => r.data.data),
    ...options,
  });

export const useEnrollmentsByTeam = (teamId, params, options = {}) =>
  useQuery({
    queryKey: qk.enrollments.byTeam(teamId, params),
    queryFn: () => enrollmentsAPI.getByTeam(teamId, params).then((r) => r.data.data),
    enabled: !!teamId,
    ...options,
  });

export const useEnrollmentsByUser = (userId, options = {}) =>
  useQuery({
    queryKey: qk.enrollments.byUser(userId),
    queryFn: () => enrollmentsAPI.getByUser(userId).then((r) => r.data.data),
    enabled: !!userId,
    ...options,
  });

export const useUpdateEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => enrollmentsAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useCheckEnrollmentConflicts = () =>
  useMutation({
    mutationFn: (data) => enrollmentsAPI.checkConflicts(data).then((r) => r.data),
  });
