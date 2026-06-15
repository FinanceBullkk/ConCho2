import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { brandingAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// Branding & templates designer hooks (TMS.update gap #5).

export function useBranding(options = {}) {
  return useQuery({
    queryKey: qk.branding.config,
    queryFn: async () => (await brandingAPI.get()).data.data,
    ...options,
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => brandingAPI.update(data).then((r) => r.data.data),
    onSuccess: (data) => qc.setQueryData(qk.branding.config, data),
  });
}
