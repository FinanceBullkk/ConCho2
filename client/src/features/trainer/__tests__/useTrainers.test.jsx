import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../../test/query-wrapper';
import { useTrainers, useTrainerLoad } from '../useTrainers';

describe('useTrainers', () => {
  it('fetches the trainer roster', async () => {
    const { result } = renderHook(() => useTrainers(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].name).toBe('Trainer One');
  });
});

describe('useTrainerLoad', () => {
  it('is disabled without a userId', () => {
    const { result } = renderHook(() => useTrainerLoad(undefined), { wrapper: qcWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches per-trainer load when a userId is given', async () => {
    const { result } = renderHook(() => useTrainerLoad('t1'), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.sessions).toBe(3);
  });
});
