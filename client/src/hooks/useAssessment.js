import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { assessmentAPI } from '../api/api';
import { qk } from './queryKeys';

const invalidateAssessments = (qc) => {
  qc.invalidateQueries({ queryKey: qk.assessment.all });
  qc.invalidateQueries({ queryKey: qk.learning.all });
};

export const useAssessments = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.assessment.assessments(params),
    queryFn: async () => (await assessmentAPI.getAssessments(params)).data,
    ...options,
  });

export const useAssessment = (id, options = {}) =>
  useQuery({
    queryKey: qk.assessment.assessment(id),
    queryFn: async () => (await assessmentAPI.getAssessment(id)).data.data,
    enabled: Boolean(id),
    ...options,
  });

export const useAssessmentAttempts = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.assessment.attempts(params),
    queryFn: async () => (await assessmentAPI.getAttempts(params)).data,
    ...options,
  });

export const useQuestionBank = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.assessment.questionBank(params),
    queryFn: async () => (await assessmentAPI.getQuestionBank(params)).data,
    ...options,
  });

export const useCreateAssessment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => assessmentAPI.createAssessment(data).then((r) => r.data.data),
    onSettled: () => invalidateAssessments(qc),
  });
};

export const useUpdateAssessment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => assessmentAPI.updateAssessment(id, data).then((r) => r.data.data),
    onSettled: () => invalidateAssessments(qc),
  });
};

export const useSubmitAssessmentAttempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assessmentId, answers }) =>
      assessmentAPI.submitAttempt(assessmentId, { answers }).then((r) => r.data.data),
    onSettled: () => invalidateAssessments(qc),
  });
};

export const useManualGradeAttempt = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, answers }) =>
      assessmentAPI.manualGradeAttempt(attemptId, { answers }).then((r) => r.data.data),
    onSuccess: () => toast.success('Attempt graded'),
    onSettled: () => invalidateAssessments(qc),
  });
};

export const useCreateQuestionBankItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => assessmentAPI.createQuestionBankItem(data).then((r) => r.data.data),
    onSuccess: () => toast.success('Question saved'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.assessment.all }),
  });
};

export const useArchiveQuestionBankItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => assessmentAPI.archiveQuestionBankItem(id).then((r) => r.data.data),
    onSuccess: () => toast.success('Question archived'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.assessment.all }),
  });
};

export const useArchiveAssessment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => assessmentAPI.archiveAssessment(id).then((r) => r.data.data),
    onSuccess: () => toast.success('Assessment archived'),
    onSettled: () => invalidateAssessments(qc),
  });
};
