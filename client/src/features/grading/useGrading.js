import { useQuery } from '@tanstack/react-query';
import { assessmentAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// Grading workspace feed (convergence Phase 4 — slice C2). The staff "to-grade"
// list across BOTH assessment modes — quiz units (assessments with manually
// graded items) + rubric units (team-world English classes) — scoped server-side
// to what the actor can grade. Returns { quiz: [...], rubric: [...] }.
export const useGradingQueue = (options = {}) =>
  useQuery({
    queryKey: qk.assessment.gradingQueue,
    queryFn: async () => (await assessmentAPI.getGradingQueue()).data.data,
    ...options,
  });
