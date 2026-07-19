import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { englishTrainingAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

const data = (request) => request.then((response) => response.data.data);

export const useEnglishOverview = () => useQuery({ queryKey: qk.englishTraining.overview, queryFn: () => data(englishTrainingAPI.getOverview()) });
export const useEnglishCohorts = () => useQuery({ queryKey: qk.englishTraining.cohorts, queryFn: () => data(englishTrainingAPI.getCohorts()) });
export const useEnglishCourses = () => useQuery({ queryKey: qk.englishTraining.courses, queryFn: () => data(englishTrainingAPI.getCourses()) });
export const useEnglishEmployees = (params) => useQuery({ queryKey: qk.englishTraining.employees(params), queryFn: () => data(englishTrainingAPI.getEmployees(params)) });
export const useEnglishSessions = (params) => useQuery({ queryKey: qk.englishTraining.sessions(params), queryFn: () => data(englishTrainingAPI.getSessions(params)) });
export const useEnglishSessionAttendance = (id) => useQuery({
  queryKey: qk.englishTraining.sessionAttendance(id),
  queryFn: () => data(englishTrainingAPI.getSessionAttendance(id)),
  enabled: Boolean(id),
});
export const useEnglishEligibility = (params) => useQuery({ queryKey: qk.englishTraining.eligibility(params), queryFn: () => data(englishTrainingAPI.getEligibility(params)) });
export const useEnglishIssues = () => useQuery({ queryKey: qk.englishTraining.issues, queryFn: () => data(englishTrainingAPI.getIssues()) });
export const useEnglishIssueDetails = (code) => useQuery({
  queryKey: qk.englishTraining.issueDetails(code),
  queryFn: () => data(englishTrainingAPI.getIssueDetails(code)),
  enabled: Boolean(code),
});

// ── Phase 3: evaluation (exam result & level) ───────────────────────────────

export const useEnglishLevels = () => useQuery({ queryKey: qk.englishTraining.levels, queryFn: () => data(englishTrainingAPI.getLevels()) });
export const useEnglishPendingExamEntries = () => useQuery({ queryKey: qk.englishTraining.pendingExamEntries, queryFn: () => data(englishTrainingAPI.getPendingExamEntries()) });
export const useEnglishCourseRun = (id) => useQuery({
  queryKey: qk.englishTraining.courseRun(id),
  queryFn: () => data(englishTrainingAPI.getCourseRun(id)),
  enabled: Boolean(id),
});

export const useRecordExamResult = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ enrollmentId, ...payload }) => data(englishTrainingAPI.recordExamResult(enrollmentId, payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.englishTraining.all });
      toast.success(t('englishTraining.exam.saved'));
    },
    onError: (error) => toast.error(error?.response?.data?.message || t('englishTraining.exam.saveError')),
  });
};

// Save one shared class exam date + a level for every eligible learner in one
// click. Fires the writes concurrently and reports a single summary toast so HR
// is not spammed with one toast per learner.
export const useRecordExamResultsBatch = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (entries) => {
      const settled = await Promise.allSettled(
        entries.map((e) => englishTrainingAPI.recordExamResult(e.enrollmentId, { levelCode: e.levelCode, examDate: e.examDate })),
      );
      const saved = settled.filter((r) => r.status === 'fulfilled').length;
      return { saved, failed: settled.length - saved };
    },
    onSuccess: ({ saved, failed }) => {
      queryClient.invalidateQueries({ queryKey: qk.englishTraining.all });
      if (failed) toast.error(t('englishTraining.exam.savedSome', { saved, failed }));
      else toast.success(t('englishTraining.exam.savedAll', { count: saved }));
    },
    onError: (error) => toast.error(error?.response?.data?.message || t('englishTraining.exam.saveError')),
  });
};

export const useDeleteExamResult = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (enrollmentId) => data(englishTrainingAPI.deleteExamResult(enrollmentId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.englishTraining.all });
      toast.success(t('englishTraining.exam.cleared'));
    },
    onError: (error) => toast.error(error?.response?.data?.message || t('englishTraining.exam.saveError')),
  });
};

export const useCorrectEnglishEmployee = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ empCode, ...payload }) => data(englishTrainingAPI.correctEmployee(empCode, payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.englishTraining.all });
      toast.success(t('englishTraining.correctionSaved'));
    },
    onError: (error) => toast.error(error?.response?.data?.message || t('englishTraining.correctionSaveError')),
  });
};
