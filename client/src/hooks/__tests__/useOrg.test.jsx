import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../test/query-wrapper';
import { useDepartments, useOffices, useMyTeam, useCreateDepartment } from '../useOrg';

describe('useDepartments', () => {
  it('fetches departments', async () => {
    const { result } = renderHook(() => useDepartments(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].name).toBe('Engineering');
  });
});

describe('useOffices', () => {
  it('fetches offices', async () => {
    const { result } = renderHook(() => useOffices(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].name).toBe('HQ');
  });
});

describe('useMyTeam', () => {
  it('fetches the self-scoped direct-reports list', async () => {
    const { result } = renderHook(() => useMyTeam(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].name).toBe('Direct Report');
  });
});

describe('useCreateDepartment', () => {
  it('creates a department', async () => {
    const { result } = renderHook(() => useCreateDepartment(), { wrapper: qcWrapper() });
    result.current.mutate({ name: 'Sales' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
