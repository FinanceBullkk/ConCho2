import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFieldsAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// Admin-defined custom field definitions (Studio ▸ Custom fields).
// Also consumed by the Program builder to render an org's extra Program fields.
export function useCustomFields(params, options = {}) {
  return useQuery({
    queryKey: qk.customFields.list(params),
    queryFn: async () => (await customFieldsAPI.getAll(params)).data.data,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.customFields.all });
}

export function useCreateCustomField() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (data) => customFieldsAPI.create(data).then((r) => r.data.data),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomField() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, data }) => customFieldsAPI.update(id, data).then((r) => r.data.data),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomField() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id) => customFieldsAPI.delete(id).then((r) => r.data.data),
    onSuccess: invalidate,
  });
}
