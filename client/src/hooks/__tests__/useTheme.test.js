import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../useTheme';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  localStorageMock.clear();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });
  document.documentElement.classList.remove('dark');
  // Mock matchMedia (jsdom doesn't implement it)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('useTheme', () => {
  it('defaults to dark when system prefers dark', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('respects stored light preference', () => {
    localStorageMock.setItem('tms-theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle switches from dark to light', () => {
    localStorageMock.setItem('tms-theme', 'dark');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(false);
    expect(localStorageMock.getItem('tms-theme')).toBe('light');
  });

  it('toggle switches from light to dark', () => {
    localStorageMock.setItem('tms-theme', 'light');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(true);
    expect(localStorageMock.getItem('tms-theme')).toBe('dark');
  });
});
