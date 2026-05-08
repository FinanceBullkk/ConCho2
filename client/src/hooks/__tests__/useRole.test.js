import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRole } from '../useRole';

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

function renderAsRole(role) {
  useAuth.mockReturnValue({ user: { role } });
  return renderHook(() => useRole()).result.current;
}

describe('useRole', () => {
  it('returns false for all permissions when unauthenticated', () => {
    useAuth.mockReturnValue({ user: null });
    const { can } = renderHook(() => useRole()).result.current;
    expect(can('delete:user')).toBe(false);
    expect(can('access:admin')).toBe(false);
  });

  it('Admin can delete:user', () => {
    expect(renderAsRole('Admin').can('delete:user')).toBe(true);
  });

  it('Teacher cannot delete:user', () => {
    expect(renderAsRole('Teacher').can('delete:user')).toBe(false);
  });

  it('Participant cannot access:admin', () => {
    expect(renderAsRole('Participant').can('access:admin')).toBe(false);
  });

  it('Teacher can record:attendance', () => {
    expect(renderAsRole('Teacher').can('record:attendance')).toBe(true);
  });

  it('Participant can book:class', () => {
    expect(renderAsRole('Participant').can('book:class')).toBe(true);
  });

  it('canAny returns true if any permission matches', () => {
    const { canAny } = renderAsRole('Teacher');
    expect(canAny(['delete:user', 'record:attendance'])).toBe(true);
  });

  it('canAll returns false if any permission missing', () => {
    const { canAll } = renderAsRole('Teacher');
    expect(canAll(['record:attendance', 'delete:user'])).toBe(false);
  });

  it('unknown permission fails closed with false', () => {
    const { can } = renderAsRole('Admin');
    expect(can('nonexistent:perm')).toBe(false);
  });

  it('isAdmin is true only for Admin role', () => {
    expect(renderAsRole('Admin').isAdmin).toBe(true);
    expect(renderAsRole('Teacher').isAdmin).toBe(false);
  });
});
