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

  // ── AUDIT PR 8 (AUTHZ-003 / FE-002) ──────────────────────────
  // Server route reality check: server/routes/scheduleRoutes.js mounts
  // roleGuard('Admin') on admin-create / update / delete. Teacher does
  // NOT have these permissions. Previously the UI claimed they did,
  // which surfaced buttons that 403'd on submit.
  describe('Teacher schedule write permissions match server', () => {
    it('Teacher cannot create:schedule', () => {
      expect(renderAsRole('Teacher').can('create:schedule')).toBe(false);
    });
    it('Teacher cannot update:schedule', () => {
      expect(renderAsRole('Teacher').can('update:schedule')).toBe(false);
    });
    it('Teacher cannot delete:schedule', () => {
      expect(renderAsRole('Teacher').can('delete:schedule')).toBe(false);
    });
    it('Teacher can still read:schedules', () => {
      expect(renderAsRole('Teacher').can('read:schedules')).toBe(true);
    });
    it('Teacher cannot read:users (Admin-only at route)', () => {
      expect(renderAsRole('Teacher').can('read:users')).toBe(false);
    });
    it('Teacher cannot read:teams (Admin + Participant my-teams only)', () => {
      expect(renderAsRole('Teacher').can('read:teams')).toBe(false);
    });
    it('Admin retains all schedule write permissions', () => {
      const { can } = renderAsRole('Admin');
      expect(can('create:schedule')).toBe(true);
      expect(can('update:schedule')).toBe(true);
      expect(can('delete:schedule')).toBe(true);
    });
    it('Participant can read:teams via /my-teams', () => {
      expect(renderAsRole('Participant').can('read:teams')).toBe(true);
    });
  });

  // ── AUDIT PR 8 — new perm wired ─────────────────────────────
  it('only Admin holds sync:sheets', () => {
    expect(renderAsRole('Admin').can('sync:sheets')).toBe(true);
    expect(renderAsRole('Teacher').can('sync:sheets')).toBe(false);
    expect(renderAsRole('Participant').can('sync:sheets')).toBe(false);
  });
});
