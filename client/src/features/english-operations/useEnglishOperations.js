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

export const useCanonicalEnglishCourseRuns = () => useQuery({
  queryKey: qk.englishOperations.canonicalCourseRuns,
  queryFn: () => payload(englishOperationsAPI.getCanonicalCourseRuns()).then((body) => body.data),
});

const loadAllCanonicalEmployees = async () => {
  const rows = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const body = await payload(englishOperationsAPI.getCanonicalEmployees({ limit: 200, offset }));
    const batch = body.data || [];
    rows.push(...batch);
    if (batch.length < 200) return rows;
  }
  throw new Error('English employee page limit exceeded');
};

export const useCanonicalEnglishEmployees = (enabled = true) => useQuery({
  queryKey: [...qk.englishOperations.all, 'canonical-employees'],
  queryFn: loadAllCanonicalEmployees,
  enabled,
});

const ARCHIVE_PAGE_SIZE = 200;
const ARCHIVE_MAX_PAGES = 20;

const fetchSessionPage = (page) => payload(englishTrainingAPI.getSessions({
  limit: ARCHIVE_PAGE_SIZE,
  offset: page * ARCHIVE_PAGE_SIZE,
}));

const loadAllCanonicalSessions = async () => {
  // Page 0 tells us the full count, so the remaining pages fetch in parallel
  // instead of one sequential round-trip each (was 5 serial calls for ~985
  // sessions). The endpoint is still bounded and safe for imported evidence and
  // live Meeting-backed Session Units alike.
  const first = await fetchSessionPage(0);
  const rows = first.data || [];
  const total = first.total ?? rows.length;
  const pageCount = Math.min(Math.ceil(total / ARCHIVE_PAGE_SIZE), ARCHIVE_MAX_PAGES);
  if (pageCount <= 1) return rows;

  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, i) => fetchSessionPage(i + 1)),
  );
  for (const body of rest) rows.push(...(body.data || []));
  return rows;
};

export const useCanonicalEnglishSessions = (enabled = true) => useQuery({
  queryKey: qk.englishOperations.canonicalSessions,
  queryFn: loadAllCanonicalSessions,
  enabled,
  staleTime: 60 * 1000,
});

export const useEnglishArchiveSessions = (enabled = true) => useQuery({
  queryKey: qk.englishOperations.archiveSessions,
  queryFn: loadAllCanonicalSessions,
  enabled,
  staleTime: 5 * 60 * 1000,
});

export const useCanonicalEnglishAttendanceRoster = (courseRunId, sessionUnitId, enabled = true) => useQuery({
  queryKey: qk.englishOperations.canonicalAttendance(courseRunId, sessionUnitId),
  queryFn: () => payload(
    englishOperationsAPI.getCanonicalAttendanceRoster(courseRunId, sessionUnitId),
  ).then((body) => body.data),
  enabled: enabled && Boolean(courseRunId && sessionUnitId),
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

export const useAddCanonicalRunEnrollment = () => useLearnerMutation(
  ({ courseRunId, data }) => payload(englishOperationsAPI.addCanonicalRunEnrollment(courseRunId, data)),
  'englishOperations.classes.learnerAdded',
  'englishOperations.classes.learnerAddError',
);

export const useLeaveCanonicalRunEnrollment = () => useLearnerMutation(
  ({ courseRunId, enrollmentId, data }) => payload(
    englishOperationsAPI.leaveCanonicalRunEnrollment(courseRunId, enrollmentId, data),
  ),
  'englishOperations.classes.learnerLeft',
  'englishOperations.classes.learnerLeaveError',
);

export const useTransferCanonicalRunEnrollment = () => useLearnerMutation(
  ({ sourceCourseRunId, enrollmentId, data }) => payload(
    englishOperationsAPI.transferCanonicalRunEnrollment(sourceCourseRunId, enrollmentId, data),
  ),
  'englishOperations.classes.learnerTransferred',
  'englishOperations.classes.learnerTransferError',
);

export const useCreateCanonicalEnglishSession = () => useLearnerMutation(
  ({ courseRunId, data }) => payload(englishOperationsAPI.createCanonicalSession(courseRunId, data)),
  'englishOperations.schedule.created',
  'englishOperations.schedule.saveError',
);

export const useRescheduleCanonicalEnglishMeeting = () => useLearnerMutation(
  ({ courseRunId, meetingId, data }) => payload(
    englishOperationsAPI.rescheduleCanonicalMeeting(courseRunId, meetingId, data),
  ),
  'englishOperations.schedule.updated',
  'englishOperations.schedule.saveError',
);

export const useCancelCanonicalEnglishMeeting = () => useLearnerMutation(
  ({ courseRunId, meetingId, data }) => payload(
    englishOperationsAPI.cancelCanonicalMeeting(courseRunId, meetingId, data),
  ),
  'englishOperations.schedule.cancelled',
  'englishOperations.schedule.cancelError',
);

export const useSaveCanonicalEnglishAttendance = () => useLearnerMutation(
  ({ courseRunId, sessionUnitId, data }) => payload(
    englishOperationsAPI.saveCanonicalAttendanceRoster(courseRunId, sessionUnitId, data),
  ),
  'englishOperations.attendance.saved',
  'englishOperations.attendance.saveError',
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
