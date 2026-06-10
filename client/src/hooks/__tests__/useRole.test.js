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

  it('Teacher can manage assessments to match assessment.manage capability', () => {
    expect(renderAsRole('Teacher').can('manage:assessment')).toBe(true);
    expect(renderAsRole('Participant').can('manage:assessment')).toBe(false);
  });

  it('Teacher can read feedback while Participant uses self-service feedback UI', () => {
    expect(renderAsRole('Teacher').can('read:feedback')).toBe(true);
    expect(renderAsRole('Participant').can('read:feedback')).toBe(false);
  });

  it('Teacher can read assignments but only Admin can manage them', () => {
    expect(renderAsRole('Admin').can('manage:assignments')).toBe(true);
    expect(renderAsRole('Teacher').can('read:assignments')).toBe(true);
    expect(renderAsRole('Teacher').can('manage:assignments')).toBe(false);
    expect(renderAsRole('Participant').can('read:assignments')).toBe(false);
  });

  it('Admin and Teacher can reach Learning reports while Participant cannot', () => {
    expect(renderAsRole('Admin').can('read:reports')).toBe(true);
    expect(renderAsRole('Teacher').can('read:reports')).toBe(true);
    expect(renderAsRole('Participant').can('read:reports')).toBe(false);
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

  // ── Coordinator role (re-center Phase 1) ─────────────────────
  // Mirrors server policy/capabilities.js: a training-ops management
  // bundle, never user-account/security or org-placement surfaces.
  describe('Coordinator permissions match the server capability bundle', () => {
    it('Coordinator manages offices and reads departments', () => {
      const { can } = renderAsRole('Coordinator');
      expect(can('read:office')).toBe(true);
      expect(can('manage:office')).toBe(true);
      expect(can('read:department')).toBe(true);
      expect(can('manage:department')).toBe(false);
    });

    it('Coordinator holds the learning management bundle', () => {
      const { can } = renderAsRole('Coordinator');
      expect(can('create:program')).toBe(true);
      expect(can('create:cohort')).toBe(true);
      expect(can('read:reports')).toBe(true);
      expect(can('manage:assignments')).toBe(true);
      expect(can('manage:path')).toBe(true);
      // Server grants enrollment.manage, but the enroll modal's learner picker
      // reads /api/users (Admin-only) — UI stays Admin until Phase 2.
      expect(can('enroll:learner')).toBe(false);
    });

    it('Coordinator cannot touch user accounts / security / org placement', () => {
      const { can } = renderAsRole('Coordinator');
      expect(can('read:users')).toBe(false);
      expect(can('create:user')).toBe(false);
      expect(can('delete:user')).toBe(false);
      expect(can('assign:org')).toBe(false);
      expect(can('access:admin')).toBe(false);
      expect(can('manage:settings')).toBe(false);
    });

    it('Teacher can read:office but not manage:office', () => {
      expect(renderAsRole('Teacher').can('read:office')).toBe(true);
      expect(renderAsRole('Teacher').can('manage:office')).toBe(false);
      expect(renderAsRole('Participant').can('read:office')).toBe(false);
    });

    it('isCoordinator is true only for the Coordinator role', () => {
      expect(renderAsRole('Coordinator').isCoordinator).toBe(true);
      expect(renderAsRole('Admin').isCoordinator).toBe(false);
    });
  });
});
