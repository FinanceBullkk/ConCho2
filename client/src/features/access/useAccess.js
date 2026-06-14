import { useQuery } from '@tanstack/react-query';
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
