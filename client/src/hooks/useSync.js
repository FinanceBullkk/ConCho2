import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncAPI, exportAPI } from '../api/api';
import { qk } from './queryKeys';

export const useSyncStatus = (options = {}) =>
  useQuery({
    queryKey: qk.sync.status,
    queryFn: () => syncAPI.status().then((r) => r.data.data),
    ...options,
  });

export const useGoogleSheetsSync = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => syncAPI.googleSheets(data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sync.status });
      qc.invalidateQueries({ queryKey: qk.users.all });
      qc.invalidateQueries({ queryKey: qk.teams.all });
      qc.invalidateQueries({ queryKey: qk.classes.all });
    },
  });
};

export const useExportStats = (options = {}) =>
  useQuery({
    queryKey: qk.exportHr.stats,
    queryFn: () => exportAPI.getStats().then((r) => r.data.data),
    ...options,
  });

export const useDownloadAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params = {}) => exportAPI.downloadAttendance(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.exportHr.stats }),
  });
};
