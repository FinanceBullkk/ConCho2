import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { skillsAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// Skills / competency framework hooks (TMS.update gap #4).

// `{ skills, categories }` — Studio grid + pickers.
export function useSkills(options = {}) {
  return useQuery({
    queryKey: qk.skills.list,
    queryFn: async () => (await skillsAPI.list()).data.data,
    ...options,
  });
}

// Per-role required skills + workforce coverage (Studio).
export function useRoleProfiles(options = {}) {
  return useQuery({
    queryKey: qk.skills.roleProfiles,
    queryFn: async () => (await skillsAPI.roleProfiles()).data.data,
    ...options,
  });
}

// One learner's derived proficiency + role gap (Learner 360°). Self-or-manage.
export function useLearnerSkills(userId, options = {}) {
  return useQuery({
    queryKey: qk.skills.learner(userId),
    queryFn: async () => (await skillsAPI.learner(userId)).data.data,
    enabled: Boolean(userId),
    ...options,
  });
}

// Skill taxonomy tree (category → parent → children) — B2 skills-as-spine.
export function useTaxonomy(options = {}) {
  return useQuery({
    queryKey: qk.skills.taxonomy,
    queryFn: async () => (await skillsAPI.taxonomy()).data.data,
    ...options,
  });
}

// Gap-driven program recommendations for one learner (self-or-manage) — B2.
export function useLearnerRecommendations(userId, options = {}) {
  return useQuery({
    queryKey: qk.skills.recommendations(userId),
    queryFn: async () => (await skillsAPI.recommendations(userId)).data.data,
    enabled: Boolean(userId),
    ...options,
  });
}

const invalidate = (qc) => {
  qc.invalidateQueries({ queryKey: qk.skills.all });
};

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => skillsAPI.create(data).then((r) => r.data.data),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => skillsAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => skillsAPI.delete(id).then((r) => r.data.data),
    onSuccess: () => invalidate(qc),
  });
}
