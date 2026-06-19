import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../../test/query-wrapper';
import { useRooms, useCreateRoom } from '../useRooms';

describe('useRooms', () => {
  it('fetches the office-scoped room list', async () => {
    const { result } = renderHook(() => useRooms(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].name).toBe('Room A');
  });
});

describe('useCreateRoom', () => {
  it('creates a room and resolves successfully', async () => {
    const { result } = renderHook(() => useCreateRoom(), { wrapper: qcWrapper() });
    result.current.mutate({ name: 'Room B', officeId: 'o1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ _id: 'r2' });
  });
});
