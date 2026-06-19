import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../../test/query-wrapper';
import { useMyNotifications, useNotificationPreferences } from '../useNotifications';

describe('useMyNotifications', () => {
  it('returns the full feed envelope (data + unreadCount)', async () => {
    // disable the 3-min poll so no timer lingers after the test
    const { result } = renderHook(() => useMyNotifications({ refetchInterval: false }), {
      wrapper: qcWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.unreadCount).toBe(1);
    expect(result.current.data.data).toHaveLength(1);
  });
});

describe('useNotificationPreferences', () => {
  it('fetches per-category delivery preferences', async () => {
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.inApp).toBe(true);
  });
});
