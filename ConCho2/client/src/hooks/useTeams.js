import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { teamsAPI } from '../api/api';
import { qk } from './queryKeys';

export const useTeams = (options = {}) =>
  useQuery({
    queryKey: qk.teams.list,
    queryFn: () => teamsAPI.getAll().then((r) => r.data.data),
    ...options,
  });

export const useMyTeams = (options = {}) =>
  useQuery({
    queryKey: qk.teams.mine,
    queryFn: () => teamsAPI.getMyTeams().then((r) => r.data.data),
    ...options,
  });

export const useTeam = (id, options = {}) =>
  useQuery({
    queryKey: qk.teams.detail(id),
    queryFn: () => teamsAPI.getById(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export const useTeamProgress = (id, options = {}) =>
  useQuery({
    queryKey: qk.teams.progress(id),
    queryFn: () => teamsAPI.getProgress(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

const invalidateTeamScopes = (qc) => {
  qc.invalidateQueries({ queryKey: qk.teams.all });
  qc.invalidateQueries({ queryKey: qk.users.all });
  qc.invalidateQueries({ queryKey: qk.schedules.all });
  qc.invalidateQueries({ queryKey: qk.dashboard.stats });
};

export const useCreateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => teamsAPI.create(data).then((r) => r.data.data),
    onSuccess: () => { toast.success('Team created'); invalidateTeamScopes(qc); },
  });
};

export const useUpdateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => teamsAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => { toast.success('Team updated'); invalidateTeamScopes(qc); },
  });
};

export const useDeleteTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => teamsAPI.delete(id),
    onSuccess: () => { toast.success('Team deleted'); invalidateTeamScopes(qc); },
  });
};
