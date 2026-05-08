import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { attendanceAPI } from '../api/api';
import { qk } from './queryKeys';

export const useAttendanceBySchedule = (scheduleId, options = {}) =>
  useQuery({
    queryKey: qk.attendance.bySchedule(scheduleId),
    queryFn: () => attendanceAPI.getBySchedule(scheduleId).then((r) => r.data.data),
    enabled: !!scheduleId,
    ...options,
  });

export const useAttendanceByUser = (userId, options = {}) =>
  useQuery({
    queryKey: qk.attendance.byUser(userId),
    queryFn: () => attendanceAPI.getByUser(userId).then((r) => r.data.data),
    enabled: !!userId,
    ...options,
  });

export const useAttendanceAnalyticsByEmployee = (params, options = {}) =>
  useQuery({
    queryKey: qk.attendance.analyticsByEmployee(params),
    queryFn: () => attendanceAPI.getAnalyticsByEmployee(params).then((r) => r.data.data),
    ...options,
  });

export const useAttendanceAnalyticsByTeam = (params, options = {}) =>
  useQuery({
    queryKey: qk.attendance.analyticsByTeam(params),
    queryFn: () => attendanceAPI.getAnalyticsByTeam(params).then((r) => r.data.data),
    ...options,
  });

export const useAttendanceAnalyticsByClass = (params, options = {}) =>
  useQuery({
    queryKey: qk.attendance.analyticsByClass(params),
    queryFn: () => attendanceAPI.getAnalyticsByClass(params).then((r) => r.data.data),
    ...options,
  });

export const useMyAttendanceStats = (options = {}) =>
  useQuery({
    queryKey: qk.attendance.myStats,
    queryFn: () => attendanceAPI.getMyStats().then((r) => r.data.data),
    ...options,
  });

export const useBulkMarkAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, records }) =>
      attendanceAPI.bulkMark(scheduleId, records).then((r) => r.data),
    onSuccess: (_data, vars) => {
      toast.success('Attendance recorded');
      qc.invalidateQueries({ queryKey: qk.attendance.all });
      qc.invalidateQueries({ queryKey: qk.attendance.bySchedule(vars.scheduleId) });
      qc.invalidateQueries({ queryKey: qk.schedules.attendanceCalendar });
      qc.invalidateQueries({ queryKey: qk.dashboard.stats });
    },
  });
};
