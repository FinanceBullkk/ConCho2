import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../test/query-wrapper';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../useSchedulingConfig';

describe('useSchedulingConfig', () => {
  it('reads the authoritative slot config from the server', async () => {
    const { result } = renderHook(() => useSchedulingConfig(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.weeklyTeamLimit).toBe(2);
    expect(result.current.data.slots).toHaveLength(1);
    expect(result.current.data.slots[0]).toMatchObject({ startHour: 10, durationMinutes: 60 });
  });

  it('honours an enabled:false option (no fetch)', () => {
    const { result } = renderHook(() => useSchedulingConfig({ enabled: false }), { wrapper: qcWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('exposes the fixed VN offset fallback constant', () => {
    expect(DEFAULT_UTC_OFFSET_MINUTES).toBe(420);
  });
});
