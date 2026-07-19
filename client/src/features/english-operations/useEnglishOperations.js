import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { attendanceAPI, englishOperationsAPI, learningAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

const payload = (request) => request.then((response) => response.data);

export const useEnglishOperationsOverview = () => useQuery({
  queryKey: qk.englishOperations.overview,
  queryFn: () => payload(englishOperationsAPI.getOverview()).then((body) => body.data),
});

export const useManagedEnglishLearners = (params, enabled = true) => useQuery({
  queryKey: qk.englishOperations.learners(params),
  queryFn: () => payload(englishOperationsAPI.getManagedLearners(params)),
  enabled,
});

export const useEnglishPrograms = () => useQuery({
  queryKey: qk.englishOperations.programs,
  queryFn: () => payload(learningAPI.getPrograms({ category: 'english', status: 'active', liveEnglish: true })).then((body) => body.data),
});

export const useEnglishClasses = () => useQuery({
  queryKey: qk.englishOperations.classes,
  queryFn: () => payload(learningAPI.getCohorts({ category: 'english', liveEnglish: true, limit: 500 })).then((body) => body.data),
});

export const useEnglishClassRoster = (cohortId) => useQuery({
  queryKey: qk.englishOperations.roster(cohortId),
  queryFn: () => payload(learningAPI.getEnrollments({ cohortId })).then((body) => body.data),
  enabled: Boolean(cohortId),
});

export const useEnglishTeachers = (enabled = true) => useQuery({
  queryKey: qk.englishOperations.teachers,
  queryFn: () => payload(englishOperationsAPI.getTeachers()).then((body) => body.data),
  enabled,
});

export const useEnglishSessions = (cohorts = []) => {
  const ids = cohorts.map((cohort) => cohort._id).sort();
  return useQuery({
    queryKey: qk.englishOperations.sessions(ids),
    queryFn: async () => {
      const pages = await Promise.all(ids.map((cohortId) => payload(learningAPI.getSessions({ cohortId, limit: 500 }))));
      return pages.flatMap((page) => page.data || []).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    },
    enabled: ids.length > 0,
  });
};

export const useEnglishSession = (sessionId) => useQuery({
  queryKey: qk.englishOperations.session(sessionId),
  queryFn: () => payload(learningAPI.getSession(sessionId)).then((body) => body.data),
  enabled: Boolean(sessionId),
});

export const useEnglishSessionAttendance = (sessionId) => useQuery({
  queryKey: qk.englishOperations.attendance(sessionId),
  queryFn: () => payload(attendanceAPI.getBySchedule(sessionId)).then((body) => body.data),
  enabled: Boolean(sessionId),
});

export const useEnglishEligibility = (cohortId) => useQuery({
  queryKey: qk.englishOperations.eligibility(cohortId),
  queryFn: () => payload(englishOperationsAPI.getLiveEligibility(cohortId)).then((body) => body.data),
  enabled: Boolean(cohortId),
});

export const useEnglishEvaluations = (cohortId) => useQuery({
  queryKey: qk.englishOperations.evaluations(cohortId),
  queryFn: () => payload(englishOperationsAPI.getLiveEvaluations(cohortId)).then((body) => body.data),
  enabled: Boolean(cohortId),
});

export const useRecordEnglishEvaluation = () => useLearnerMutation(
  ({ cohortId, data }) => payload(englishOperationsAPI.recordLiveEvaluation(cohortId, data)),
  'englishOperations.evaluation.saved',
  'englishOperations.evaluation.saveError',
);

export const useDeleteEnglishEvaluation = () => useLearnerMutation(
  (evaluationId) => payload(englishOperationsAPI.deleteLiveEvaluation(evaluationId)),
  'englishOperations.evaluation.cleared',
  'englishOperations.evaluation.clearError',
);

export const useEnglishArchiveStatus = () => useQuery({
  queryKey: qk.englishOperations.archiveStatus,
  queryFn: () => payload(englishOperationsAPI.getArchiveStatus()).then((body) => body.data),
});

export const useEnglishCombinedHistory = (enabled) => useQuery({
  queryKey: qk.englishOperations.combinedHistory,
  queryFn: () => payload(englishOperationsAPI.getCombinedHistory()).then((body) => body.data),
  enabled,
});

export const useCutoverEnglishArchive = () => useLearnerMutation(
  (data) => payload(englishOperationsAPI.cutoverArchive(data)),
  'englishOperations.archive.cutoverComplete',
  'englishOperations.archive.cutoverError',
);

export const useMarkEnglishAttendance = () => useLearnerMutation(
  ({ sessionId, records }) => payload(attendanceAPI.bulkMark(sessionId, records)),
  'englishOperations.attendance.saved',
  'englishOperations.attendance.saveError',
);

export const useBookEnglishSession = () => useLearnerMutation(
  (data) => payload(learningAPI.bookSession(data)),
  'englishOperations.schedule.created',
  'englishOperations.schedule.saveError',
);

export const useCreateEnglishProgram = () => useLearnerMutation(
  (data) => payload(learningAPI.createProgram(data)),
  'englishOperations.classes.programCreated',
  'englishOperations.classes.saveError',
);

export const useCreateEnglishClass = () => useLearnerMutation(
  async ({ cohort, learnerIds }) => {
    const created = await payload(learningAPI.createCohort(cohort));
    if (learnerIds.length > 0) {
      await payload(learningAPI.bulkEnroll({ cohortId: created.data._id, userIds: learnerIds }));
    }
    return created;
  },
  'englishOperations.classes.runCreated',
  'englishOperations.classes.saveError',
);

const useLearnerMutation = (mutationFn, successKey, errorKey) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.englishOperations.all });
      toast.success(t(successKey));
    },
    onError: (error) => toast.error(error?.response?.data?.message || t(errorKey)),
  });
};

export const useCreateManagedEnglishLearner = () => useLearnerMutation(
  (data) => payload(englishOperationsAPI.createManagedLearner(data)),
  'englishOperations.learners.created',
  'englishOperations.learners.saveError',
);

export const useUpdateManagedEnglishLearner = () => useLearnerMutation(
  ({ id, data }) => payload(englishOperationsAPI.updateManagedLearner(id, data)),
  'englishOperations.learners.updated',
  'englishOperations.learners.saveError',
);

export const useDeleteManagedEnglishLearner = () => useLearnerMutation(
  (id) => payload(englishOperationsAPI.deleteManagedLearner(id)),
  'englishOperations.learners.deleted',
  'englishOperations.learners.deleteError',
);

export const useProvisionArchiveLearners = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => payload(englishOperationsAPI.provisionArchiveLearners()),
    onSuccess: (body) => {
      queryClient.invalidateQueries({ queryKey: qk.englishOperations.all });
      const summary = body.summary || {};
      toast.success(t('englishOperations.learners.provisioned', {
        linked: summary.linked || 0,
        created: summary.created || 0,
        failed: (summary.collisions || 0) + (summary.rejected || 0),
      }));
    },
    onError: (error) => toast.error(error?.response?.data?.message || t('englishOperations.learners.provisionError')),
  });
};
