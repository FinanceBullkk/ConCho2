import { useQuery } from '@tanstack/react-query';
import { learningAPI } from '../api/api';
import { qk } from './queryKeys';

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
