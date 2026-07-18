import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { englishTrainingAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

const data = (request) => request.then((response) => response.data.data);

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
