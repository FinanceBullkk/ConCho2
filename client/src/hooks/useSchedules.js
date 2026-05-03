import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulesAPI } from '../api/api';
import { qk } from './queryKeys';

export const useSchedules = (params, options = {}) =>
  useQuery({
    queryKey: qk.schedules.list(params),
    queryFn: () => schedulesAPI.getAll(params).then((r) => r.data),
    ...options,
  });

export const useAvailability = (params, options = {}) =>
  useQuery({
    queryKey: qk.schedules.availability(params),
    queryFn: () => schedulesAPI.getAvailability(params).then((r) => r.data.data),
    ...options,
  });

export const useSchedule = (id, options = {}) =>
  useQuery({
    queryKey: qk.schedules.detail(id),
    queryFn: () => schedulesAPI.getById(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export const useMyClassSchedules = (options = {}) =>
  useQuery({
    queryKey: qk.schedules.myClass,
    queryFn: () => schedulesAPI.getMyClass().then((r) => r.data),
    ...options,
  });

export const useAttendanceCalendar = (options = {}) =>
  useQuery({
    queryKey: qk.schedules.attendanceCalendar,
    queryFn: () => schedulesAPI.getAttendanceCalendar().then((r) => r.data.data),
    ...options,
  });

const invalidateScheduleScopes = (qc) => {
  qc.invalidateQueries({ queryKey: qk.schedules.all });
  qc.invalidateQueries({ queryKey: qk.attendance.all });
  qc.invalidateQueries({ queryKey: qk.dashboard.stats });
};

export const useCreateSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => schedulesAPI.create(data).then((r) => r.data.data),
    onSuccess: () => invalidateScheduleScopes(qc),
  });
};

export const useUpdateSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => schedulesAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => invalidateScheduleScopes(qc),
  });
};

export const useDeleteSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => schedulesAPI.delete(id),
    onSuccess: () => invalidateScheduleScopes(qc),
  });
};

export const useBookSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => schedulesAPI.bookSlot(data).then((r) => r.data),
    onSuccess: () => invalidateScheduleScopes(qc),
  });
};

export const useCancelSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => schedulesAPI.cancelSlot(id),
    onSuccess: () => invalidateScheduleScopes(qc),
  });
};
