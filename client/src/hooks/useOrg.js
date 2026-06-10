import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { orgAPI } from '../api/api';
import { qk } from './queryKeys';

// ──────────────────────────────────────────────────────────
// useOrg — React Query hooks for the org model (Wave D3 +
// re-center Phase 1): departments, offices, manager/department/
// office assignment, and the self-scoped manager "my team" dashboard.
// ──────────────────────────────────────────────────────────

// ── Reads ─────────────────────────────────────────────────
export const useDepartments = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.org.departments(params),
    queryFn: async () => (await orgAPI.getDepartments(params)).data.data,
    ...options,
  });

export const useOffices = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.org.offices(params),
    queryFn: async () => (await orgAPI.getOffices(params)).data.data,
    ...options,
  });

export const useMyTeam = (options = {}) =>
  useQuery({
    queryKey: qk.org.myTeam,
    queryFn: async () => (await orgAPI.getMyTeam()).data.data,
    ...options,
  });

// ── Mutations ─────────────────────────────────────────────
const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useCreateDepartment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => orgAPI.createDepartment(data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      toast.success('Department created');
    },
    onError: onErr,
  });
};

export const useUpdateDepartment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => orgAPI.updateDepartment(id, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      toast.success('Department updated');
    },
    onError: onErr,
  });
};

export const useArchiveDepartment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => orgAPI.archiveDepartment(id).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      toast.success('Department archived');
    },
    onError: onErr,
  });
};

export const useCreateOffice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => orgAPI.createOffice(data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      toast.success('Office created');
    },
    onError: onErr,
  });
};

export const useUpdateOffice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => orgAPI.updateOffice(id, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      toast.success('Office updated');
    },
    onError: onErr,
  });
};

export const useArchiveOffice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => orgAPI.archiveOffice(id).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      toast.success('Office archived');
    },
    onError: onErr,
  });
};

export const useAssignUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => orgAPI.assignUser(id, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users.all });
      qc.invalidateQueries({ queryKey: qk.org.myTeam });
      toast.success('Assignment updated');
    },
    onError: onErr,
  });
};
