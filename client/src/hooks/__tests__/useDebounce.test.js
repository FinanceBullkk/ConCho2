import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update value before delay elapses', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'initial' },
    });
    rerender({ v: 'updated' });
    // Not debounced yet
    expect(result.current).toBe('initial');
  });

  it('updates value after delay elapses', async () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'initial' },
    });
    rerender({ v: 'updated' });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('updated');
  });

  it('resets timer on rapid value changes', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    act(() => vi.advanceTimersByTime(100));
    rerender({ v: 'c' });
    act(() => vi.advanceTimersByTime(100));
    // Only 200ms total — not debounced yet
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('c');
  });
});
