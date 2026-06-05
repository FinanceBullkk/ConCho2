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

export const useLearningFeedback = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.feedback(params),
    queryFn: async () => (await learningAPI.getFeedback(params)).data,
    ...options,
  });

export const useLearningAssignments = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.assignments(params),
    queryFn: async () => (await learningAPI.getAssignments(params)).data,
    ...options,
  });

// Cohort completion report — only fetches once a cohort is chosen.
export const useCompletionReport = (cohortId) =>
  useQuery({
    queryKey: qk.learning.completionReport(cohortId),
    queryFn: async () => (await learningAPI.getCompletionReport({ cohortId })).data.data,
    enabled: Boolean(cohortId),
  });

export const useCompletionRollup = (options = {}) =>
  useQuery({
    queryKey: qk.learning.completionRollup,
    queryFn: async () => (await learningAPI.getCompletionRollup()).data.data,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    ...options,
  });

// Org-wide compliance report — caller controls enabled so the heavy report
// loads only after the Admin requests it.
export const useComplianceReport = (filters = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.complianceReport(filters),
    queryFn: async () => (await learningAPI.getComplianceReport(filters)).data.data,
    ...options,
  });

// Returns the raw axios response (responseType: 'blob') so the caller can read
// the Content-Disposition filename and trigger a browser download.
export const useDownloadCompletionReport = () =>
  useMutation({
    mutationFn: (cohortId) => learningAPI.downloadCompletionReport({ cohortId }),
  });

export const useDownloadComplianceReport = () =>
  useMutation({
    mutationFn: (filters = {}) => learningAPI.downloadComplianceReport(filters),
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

// ── Learning path reads + mutations ───────────────────────
export const useLearningPaths = (params = {}) =>
  useQuery({
    queryKey: qk.learning.paths(params),
    queryFn: async () => (await learningAPI.getPaths(params)).data,
  });

// Per-learner progress for one path (completed/current/locked per step + summary).
export const usePathProgress = (id) =>
  useQuery({
    queryKey: qk.learning.pathProgress(id),
    queryFn: async () => (await learningAPI.getPathProgress(id)).data,
    enabled: !!id,
  });

export const useCreatePath = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.createPath(data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useUpdatePath = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => learningAPI.updatePath(id, data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useArchivePath = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.archivePath(id),
    onSettled: () => invalidateLearning(qc),
  });
};

// ── Assignment mutations ─────────────────────────────────
export const useCreateAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.createAssignment(data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useArchiveAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.archiveAssignment(id).then((r) => r.data.data),
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

export const useSubmitFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.submitFeedback(data).then((r) => r.data.data),
    onSuccess: () => toast.success('Feedback submitted'),
    onSettled: () => invalidateLearning(qc),
  });
};
