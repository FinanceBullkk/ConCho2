import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { learningAPI } from '../api/api';
import { qk } from './queryKeys';

// ── Reads ─────────────────────────────────────────────────
export const useLearningPrograms = (params = {}) =>
  useQuery({
    queryKey: qk.learning.programs(params),
    queryFn: async () => (await learningAPI.getPrograms(params)).data,
  });

export const useLearningCohorts = (params = {}) =>
  useQuery({
    queryKey: qk.learning.cohorts(params),
    queryFn: async () => (await learningAPI.getCohorts(params)).data,
  });

export const useLearningEnrollments = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.enrollments(params),
    queryFn: async () => (await learningAPI.getEnrollments(params)).data,
    ...options,
  });

// Invalidate every learning list/detail after a write (programs, cohorts,
// enrollments) plus dashboard stats which aggregate program/cohort counts.
const invalidateLearning = (qc) => {
  qc.invalidateQueries({ queryKey: qk.learning.all });
  qc.invalidateQueries({ queryKey: qk.dashboard.stats });
};

// ── Program mutations ─────────────────────────────────────
export const useCreateProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.createProgram(data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useUpdateProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => learningAPI.updateProgram(id, data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useArchiveProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.archiveProgram(id),
    onSettled: () => invalidateLearning(qc),
  });
};

// ── Cohort mutations ──────────────────────────────────────
export const useCreateCohort = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.createCohort(data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

// ── Enrollment mutations ──────────────────────────────────
export const useEnrollLearner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.createEnrollment(data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useWithdrawEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.withdrawEnrollment(id),
    onSuccess: () => toast.success('Enrollment withdrawn'),
    onSettled: () => invalidateLearning(qc),
  });
};
