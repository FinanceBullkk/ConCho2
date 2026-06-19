import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../test/query-wrapper';
import { useGlobalSearch } from '../useSearch';

// useDebounce returns its initial value synchronously, so a query that is
// already ≥2 chars is enabled on first render — no fake timers needed.
describe('useGlobalSearch', () => {
  it('stays idle (no request) for queries shorter than 2 chars', () => {
    const { result } = renderHook(() => useGlobalSearch('a'), { wrapper: qcWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('treats whitespace-padded short input as below the threshold', () => {
    const { result } = renderHook(() => useGlobalSearch(' a '), { wrapper: qcWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches once the query reaches the 2-char minimum', async () => {
    const { result } = renderHook(() => useGlobalSearch('re'), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ _id: 'res1', type: 'user', label: 'Match: re' }]);
  });
});
