import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api/api';

const AUDIT_KEY = 'admin-audit';

export function useAuditLog({
  page = 1,
  limit = 50,
  entity = '',
  action = '',
  from = '',
  to = '',
} = {}) {
  const params = { page, limit };
  if (entity) params.entity = entity;
  if (action) params.action = action;
  if (from)   params.from   = from;
  if (to)     params.to     = to;

  return useQuery({
    queryKey: [AUDIT_KEY, params],
    queryFn: async () => {
      const { data } = await api.get('/admin/audit', { params });
      return data;
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// Verify the tamper-evident hash chain. Read-only re-derivation on the server;
// resolves to { ok, checked, from, to, firstBrokenSeq, reason }.
export function useVerifyAuditChain() {
  return useMutation({
    mutationFn: async ({ from = '', to = '' } = {}) => {
      const params = {};
      if (from) params.from = from;
      if (to)   params.to   = to;
      const { data } = await api.post('/admin/audit/verify', null, { params });
      return data?.data ?? data;
    },
  });
}
