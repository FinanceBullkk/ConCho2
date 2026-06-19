import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { learningAPI, schedulesAPI, analyticsAPI } from '../api/api';
import { qk } from './queryKeys';

// ── Reads ─────────────────────────────────────────────────
export const useLearningPrograms = (params = {}) =>
  useQuery({
    queryKey: qk.learning.programs(params),
    queryFn: async () => (await learningAPI.getPrograms(params)).data,
  });

// One program (detail page). Returns the program DTO directly (unwrapped).
export const useLearningProgram = (id, options = {}) =>
  useQuery({
    queryKey: qk.learning.program(id),
    queryFn: async () => (await learningAPI.getProgram(id)).data.data,
    enabled: Boolean(id),
    ...options,
  });

// Real monthly completion trend (certificates/month, last 8 months) — report.read.
export const useCompletionTrend = (id, options = {}) =>
  useQuery({
    queryKey: ['learning', 'program', id, 'completion-trend'],
    queryFn: async () => (await learningAPI.getCompletionTrend(id)).data.data,
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    ...options,
  });

// Per-program analytics: stored daily trend series + live funnel (Build Plan #1).
// `collecting:true` until the snapshot cron/backfill seeds history — UI then
// shows a "collecting data" state instead of an empty/fake chart. analytics.read.
export const useProgramAnalytics = (id, range = '90d', options = {}) =>
  useQuery({
    queryKey: ['analytics', 'program', id, range],
    queryFn: async () => (await analyticsAPI.getProgramAnalytics(id, range)).data.data,
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    ...options,
  });

// One cohort (detail page header). Returns the cohort DTO directly.
export const useLearningCohort = (id, options = {}) =>
  useQuery({
    queryKey: qk.learning.cohort(id),
    queryFn: async () => (await learningAPI.getCohort(id)).data.data,
    enabled: Boolean(id),
    ...options,
  });

// Cohort catalog — returns BOTH scheduling worlds; the unified UI facets team
// vs cohort by the cohort DTO's deliveryType client-side (convergence Phase 3
// slice 5 retired the server-side mode=team|cohort split).
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

// Unified self-scoped enrollment read (converge Phase 2): both team-based and
// cohort-based enrollments for the current learner, in one shape. Powers the
// "My programs" list so a learner sees ALL their cohorts regardless of how they
// joined (via a group / via direct enrollment).
export const useMyEnrollments = (options = {}) =>
  useQuery({
    queryKey: qk.learning.myEnrollments,
    queryFn: async () => (await learningAPI.getMyEnrollments()).data,
    ...options,
  });

// Own required training + enroll-CTA suggestion (Cohesion P3, self-scoped).
export const useMyAssignments = (options = {}) =>
  useQuery({
    queryKey: qk.learning.myAssignments,
    queryFn: async () => (await learningAPI.getMyAssignments()).data,
    ...options,
  });

// Per-learner completion checklist for one cohort (Cohesion P1 learner home).
// Participant calls are self-scoped server-side (completion/use-cases).
export const useCompletion = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.completion(params),
    queryFn: async () => (await learningAPI.getCompletion(params)).data.data,
    enabled: Boolean(params.cohortId),
    ...options,
  });

// Issued certificates (self-scoped for Participants; managers may filter).
export const useCertificates = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.certificates(params),
    queryFn: async () => (await learningAPI.getCertificates(params)).data.data,
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

// A5 (Modernization H1) — training-hours rollup (labour-law minimums).
export const useTrainingHours = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['learning', 'reports', 'training-hours', params],
    queryFn: async () => (await learningAPI.getTrainingHours(params)).data.data,
    staleTime: 5 * 60 * 1000,
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

// A5 part 2 — evidence pack download (raw blob response for saveBlob).
export const useDownloadEvidencePack = () =>
  useMutation({
    mutationFn: (params = {}) => learningAPI.downloadEvidencePack(params),
  });

// A5 part 2 — saved report presets (report.read).
export const useReportPresets = (options = {}) =>
  useQuery({
    queryKey: qk.learning.reportPresets,
    queryFn: async () => (await learningAPI.listReportPresets()).data.data,
    ...options,
  });

export const useCreateReportPreset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.createReportPreset(data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.learning.reportPresets }),
  });
};

export const useDeleteReportPreset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.deleteReportPreset(id).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.learning.reportPresets }),
  });
};

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

export const useUpdateCohort = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => learningAPI.updateCohort(id, data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

export const useDeleteCohort = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.deleteCohort(id).then((r) => r.data),
    onSettled: () => invalidateLearning(qc),
  });
};

// Archived cohorts (trash view) + restore.
export const useDeletedCohorts = (options = {}) =>
  useQuery({
    queryKey: qk.learning.cohorts({ deleted: true }),
    queryFn: async () => (await learningAPI.getDeletedCohorts()).data.data,
    ...options,
  });

export const useRestoreCohort = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => learningAPI.restoreCohort(id).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

// ── Session scheduling (re-center Phase 2) ────────────────
// Coordinator/Admin opens a cohort session at an Office. Also invalidates the
// schedule caches so calendar/booking grids reflect the new session.
export const useLearningSessions = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.learning.sessions(params),
    queryFn: async () => (await learningAPI.getSessions(params)).data,
    ...options,
  });

export const useBookSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.bookSession(data).then((r) => r.data.data),
    onSettled: () => {
      invalidateLearning(qc);
      qc.invalidateQueries({ queryKey: qk.schedules.all });
    },
  });
};

// Assign a session's trainers (re-center Phase 3): internal Teacher/Admin refs
// (join the attendance/visibility UNION) + an optional external trainer
// (calendar invite + display only). PUT /api/schedules/:id/trainers.
// Invalidates learning sessions + schedule caches so the lists + calendar refresh.
export const useSetTrainers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => schedulesAPI.setTrainers(id, data).then((r) => r.data.data),
    onSettled: () => {
      invalidateLearning(qc);
      qc.invalidateQueries({ queryKey: qk.schedules.all });
    },
  });
};

// Staff view of a session's waitlist queue (Wave E polish): Admin/Coordinator
// any session; Teacher their classes. GET /api/schedules/:id/waitlist.
export const useScheduleWaitlist = (scheduleId, options = {}) =>
  useQuery({
    queryKey: qk.schedules.waitlist(scheduleId),
    queryFn: async () => (await schedulesAPI.listWaitlist(scheduleId)).data,
    enabled: Boolean(scheduleId),
    ...options,
  });

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

// Bulk-enroll many learners into one cohort (Admin). Resolves to
// { enrolledCount, skipped[] } so the caller can report partial results.
export const useBulkEnrollLearners = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.bulkEnroll(data).then((r) => r.data.data),
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

// ── Roster bulk actions (cohort detail, S4) ───────────────
// Manually issue a certificate for one learner in a cohort. The caller loops
// for bulk issue so it can report per-learner success/failure.
export const useIssueCertificate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => learningAPI.issueCertificate(data).then((r) => r.data.data),
    onSettled: () => invalidateLearning(qc),
  });
};

// Nudge selected cohort learners (in-app notification). Resolves to
// { cohortId, notified }.
export const useNudgeCohort = () =>
  useMutation({
    mutationFn: ({ cohortId, ...data }) => learningAPI.nudgeCohort(cohortId, data).then((r) => r.data.data),
  });
