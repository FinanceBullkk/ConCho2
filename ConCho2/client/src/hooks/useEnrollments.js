import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      toast.success('Enrollment updated');
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useTransferEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => enrollmentsAPI.transfer(id, data).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('Member transferred successfully');
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.teams.all });
      qc.invalidateQueries({ queryKey: qk.schedules.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useCheckEnrollmentConflicts = () =>
  useMutation({
    mutationFn: (data) => enrollmentsAPI.checkConflicts(data).then((r) => r.data),
  });

// ── Bulk operations (Screen 4 Roster tab) ─────────────────

export const useBulkTransferEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => enrollmentsAPI.bulkTransfer(data).then((r) => r.data),
    onSuccess: (res) => {
      const ok = res.ok || 0;
      const failed = res.failed || 0;
      if (failed === 0) toast.success(`${ok} student${ok !== 1 ? 's' : ''} transferred`);
      else              toast.warning(`${ok} transferred · ${failed} failed`);
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.teams.all });
      qc.invalidateQueries({ queryKey: qk.schedules.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};

export const useBulkUpdateEnrollmentStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => enrollmentsAPI.bulkUpdateStatus(data).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res.message || `${res.modifiedCount || 0} enrollments updated`);
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};
