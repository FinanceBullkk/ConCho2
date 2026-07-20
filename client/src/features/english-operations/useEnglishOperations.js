import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { englishOperationsAPI, englishTrainingAPI } from '../../api/api';
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

export const useCanonicalEnglishClasses = () => useQuery({
  queryKey: [...qk.englishOperations.all, 'canonical-classes'],
  queryFn: () => payload(englishOperationsAPI.getCanonicalClasses()).then((body) => body.data),
});

export const useCanonicalEnglishClass = (classId) => useQuery({
  queryKey: [...qk.englishOperations.all, 'canonical-classes', classId],
  queryFn: () => payload(englishOperationsAPI.getCanonicalClass(classId)).then((body) => body.data),
  enabled: Boolean(classId),
});

export const useCanonicalEnglishCourses = () => useQuery({
  queryKey: [...qk.englishOperations.all, 'canonical-courses'],
  queryFn: () => payload(englishOperationsAPI.getCanonicalCourses()).then((body) => body.data),
});

export const useCanonicalEnglishEmployees = (enabled = true) => useQuery({
  queryKey: [...qk.englishOperations.all, 'canonical-employees'],
  queryFn: () => payload(englishOperationsAPI.getCanonicalEmployees({ limit: 200 })).then((body) => body.data),
  enabled,
});

const ARCHIVE_PAGE_SIZE = 200;
const ARCHIVE_MAX_PAGES = 20;

export const useEnglishArchiveSessions = (enabled = true) => useQuery({
  queryKey: qk.englishOperations.archiveSessions,
  queryFn: async () => {
    const rows = [];
    for (let page = 0; page < ARCHIVE_MAX_PAGES; page += 1) {
      // Archive reads are paged to stay within the endpoint's bounded limit.
      const body = await payload(englishTrainingAPI.getSessions({
        limit: ARCHIVE_PAGE_SIZE,
        offset: page * ARCHIVE_PAGE_SIZE,
      }));
      const batch = body.data || [];
      rows.push(...batch);
      if (batch.length < ARCHIVE_PAGE_SIZE) return rows;
    }
    throw new Error('English Archive session page limit exceeded');
  },
  enabled,
  staleTime: 5 * 60 * 1000,
});

export const useEnglishArchiveSessionAttendance = (sessionId, enabled = true) => useQuery({
  queryKey: qk.englishOperations.archiveSessionAttendance(sessionId),
  queryFn: () => payload(englishTrainingAPI.getSessionAttendance(sessionId)).then((body) => body.data),
  enabled: enabled && Boolean(sessionId),
  staleTime: 5 * 60 * 1000,
});

export const useCreateCanonicalEnglishClass = () => useLearnerMutation(
  (data) => payload(englishOperationsAPI.createCanonicalClass(data)),
  'englishOperations.classes.classCreated',
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
