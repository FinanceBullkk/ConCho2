import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/api';

const SETTINGS_KEY = ['settings'];

export const useSettings = (options = {}) =>
  useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get('/settings').then((r) => r.data.data),
    ...options,
  });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings) => api.put('/settings', { settings }).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
};
