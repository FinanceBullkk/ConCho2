/**
 * AuthContext — multi-tab + cache hygiene tests (audit PR 8 / FE-003)
 *
 * Verifies:
 *  - logout() calls queryClient.clear()
 *  - storage event removing 'tms_user' triggers a local logout
 *  - localStorage payload does NOT contain `email` (PII redaction)
 *  - Sentry.setUser receives the right shape (id/empCode/role) and null on logout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Hoisted mocks — must be `vi.hoisted` so they exist when the modules are
// first imported.
const { clearMock, setUserMock, getMeMock, loginMock, logoutMock } = vi.hoisted(() => ({
  clearMock: vi.fn(),
  setUserMock: vi.fn(),
  getMeMock: vi.fn(),
  loginMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock('../../queryClient', () => ({
  queryClient: { clear: clearMock },
}));

vi.mock('../../lib/sentry', () => ({
  Sentry: { setUser: setUserMock },
}));

vi.mock('../../api/api', () => ({
  authAPI: {
    getMe: getMeMock,
    login: loginMock,
    logout: logoutMock,
    mfaVerifyLogin: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from '../AuthContext';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  clearMock.mockClear();
  setUserMock.mockClear();
  getMeMock.mockReset();
  loginMock.mockReset();
  logoutMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('AuthContext (FE-003)', () => {
  it('logout() calls queryClient.clear() and Sentry.setUser(null)', async () => {
    getMeMock.mockResolvedValue({ data: { data: { _id: 'u1', empCode: '0001', role: 'Admin', name: 'A' } } });
    logoutMock.mockResolvedValue({});
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for the mount /auth/me probe to settle
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(setUserMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', username: '0001', role: 'Admin' }));

    await act(async () => { await result.current.logout(); });

    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(setUserMock).toHaveBeenLastCalledWith(null);
    expect(localStorage.getItem('tms_user')).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('localStorage payload omits email / department / position (PII redaction)', async () => {
    getMeMock.mockResolvedValue({
      data: {
        data: {
          _id: 'u2', empCode: '0002', name: 'B', role: 'Teacher',
          email: 'b@example.com', department: 'Sales', position: 'Senior',
          status: 'Active', mfaEnabled: false,
        },
      },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const stored = JSON.parse(localStorage.getItem('tms_user'));
    expect(stored).toMatchObject({ _id: 'u2', empCode: '0002', name: 'B', role: 'Teacher' });
    expect(stored.email).toBeUndefined();
    expect(stored.department).toBeUndefined();
    expect(stored.position).toBeUndefined();
  });

  it('storage event removing tms_user triggers logout in this tab too', async () => {
    getMeMock.mockResolvedValue({ data: { data: { _id: 'u3', empCode: '0003', role: 'Admin' } } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).not.toBeNull();

    // Simulate another tab removing tms_user
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tms_user', newValue: null }));
    });

    expect(result.current.user).toBeNull();
    expect(clearMock).toHaveBeenCalled();
    expect(setUserMock).toHaveBeenLastCalledWith(null);
  });

  it('storage event switching to a different user clears cache + updates state', async () => {
    getMeMock.mockResolvedValue({ data: { data: { _id: 'u4', empCode: '0004', role: 'Admin' } } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const otherUser = JSON.stringify({ _id: 'u-other', empCode: '0099', role: 'Teacher', name: 'X', status: 'Active' });
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'tms_user',
        newValue: otherUser,
      }));
    });

    expect(clearMock).toHaveBeenCalled();
    expect(result.current.user?._id).toBe('u-other');
    expect(setUserMock).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'u-other' }));
  });
});
