import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../../test/query-wrapper';
import {
  useSkills,
  useTaxonomy,
  useRoleProfiles,
  useLearnerSkills,
  useCreateSkill,
} from '../useSkills';

describe('useSkills', () => {
  it('fetches the { skills, categories } grid payload', async () => {
    const { result } = renderHook(() => useSkills(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.skills[0].name).toBe('React');
  });
});

describe('useTaxonomy', () => {
  it('fetches the skill taxonomy tree', async () => {
    const { result } = renderHook(() => useTaxonomy(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].name).toBe('Frontend');
  });
});

describe('useRoleProfiles', () => {
  it('fetches role required-skills profiles', async () => {
    const { result } = renderHook(() => useRoleProfiles(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].role).toBe('Teacher');
  });
});

describe('useLearnerSkills', () => {
  it('is disabled without a userId', () => {
    const { result } = renderHook(() => useLearnerSkills(null), { wrapper: qcWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches one learner proficiency when a userId is given', async () => {
    const { result } = renderHook(() => useLearnerSkills('u1'), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveProperty('proficiency');
  });
});

describe('useCreateSkill', () => {
  it('creates a skill', async () => {
    const { result } = renderHook(() => useCreateSkill(), { wrapper: qcWrapper() });
    result.current.mutate({ name: 'Vue' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
