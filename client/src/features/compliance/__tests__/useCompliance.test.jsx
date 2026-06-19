import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../../test/query-wrapper';
import { useComplianceMatrix, useCreateRequirement } from '../useCompliance';

describe('useComplianceMatrix', () => {
  it('fetches the derived compliance matrix', async () => {
    const { result } = renderHook(() => useComplianceMatrix(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveProperty('rows');
  });
});

describe('useCreateRequirement', () => {
  it('is initially idle before mutate', () => {
    const { result } = renderHook(() => useCreateRequirement(), { wrapper: qcWrapper() });
    expect(result.current.isIdle).toBe(true);
  });
});
