import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accessAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// Read-only: the live, server-enforced role × capability matrix
// (policy/capabilities.js). Admin-only on the server (SETTINGS_MANAGE).
export function useCapabilityMatrix(options = {}) {
  return useQuery({
    queryKey: qk.access.capabilityMatrix,
    queryFn: async () => (await accessAPI.getCapabilityMatrix()).data.data,
    staleTime: 10 * 60 * 1000, // the matrix is static config — cache generously
    ...options,
  });
}

// Editable roles + custom roles (gap #2). `{ roles: [{key,name,system,capabilities}], capabilities: [...] }`.
export function useRoles(options = {}) {
  return useQuery({
    queryKey: qk.access.roles,
    queryFn: async () => (await accessAPI.listRoles()).data.data,
    ...options,
  });
}

const invalidateRoles = (qc) => {
  qc.invalidateQueries({ queryKey: qk.access.roles });
  qc.invalidateQueries({ queryKey: qk.access.capabilityMatrix });
};

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => accessAPI.createRole(data).then((r) => r.data.data),
    onSuccess: () => invalidateRoles(qc),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, ...data }) => accessAPI.updateRole(key, data).then((r) => r.data.data),
    onSuccess: () => invalidateRoles(qc),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key) => accessAPI.deleteRole(key).then((r) => r.data.data),
    onSuccess: () => invalidateRoles(qc),
  });
}
