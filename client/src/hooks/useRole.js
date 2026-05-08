// ──────────────────────────────────────────────────────────
// useRole — granular permission utility hook
//
// Returns helpers for component-level feature gating so that
// individual UI elements (buttons, fields, tabs) can be shown
// or hidden based on the current user's role, without relying
// solely on ProtectedRoute which only gates entire pages.
//
// Usage:
//   const { can, isAdmin, role } = useRole();
//   if (!can('delete:user')) return null;
//
// Permission matrix:
//   Admin      — full access
//   Teacher    — manage own schedules & attendance; read users
//   Participant — read-only; can book classes for themselves
// ──────────────────────────────────────────────────────────

import { useAuth } from '../context/AuthContext';

// Permission → roles that hold it
const PERMISSION_MAP = {
  // User management
  'create:user':       ['Admin'],
  'update:user':       ['Admin'],
  'delete:user':       ['Admin'],
  'read:users':        ['Admin', 'Teacher'],
  'force-logout:user': ['Admin'],
  'disable-mfa:user':  ['Admin'],

  // Class management
  'create:class':      ['Admin'],
  'update:class':      ['Admin'],
  'delete:class':      ['Admin'],
  'read:classes':      ['Admin', 'Teacher', 'Participant'],

  // Schedule management
  'create:schedule':   ['Admin', 'Teacher'],
  'update:schedule':   ['Admin', 'Teacher'],
  'delete:schedule':   ['Admin'],
  'read:schedules':    ['Admin', 'Teacher', 'Participant'],

  // Attendance
  'record:attendance': ['Admin', 'Teacher'],
  'read:attendance':   ['Admin', 'Teacher'],

  // Enrollment
  'manage:enrollment': ['Admin'],
  'book:class':        ['Admin', 'Participant'],

  // Evaluations
  'create:evaluation': ['Admin', 'Teacher'],
  'read:evaluations':  ['Admin', 'Teacher'],

  // Admin panel
  'access:admin':      ['Admin'],
  'run:reconcile':     ['Admin'],
  'read:audit':        ['Admin'],
  'read:database':     ['Admin'],
  'manage:settings':   ['Admin'],

  // Export / import
  'export:data':       ['Admin'],
  'import:data':       ['Admin'],
};

export function useRole() {
  const { user } = useAuth();
  const role = user?.role ?? null;

  /**
   * can(permission) → boolean
   * Returns true if the current user's role holds the given permission.
   * Returns false (safe deny) if the user is not authenticated.
   */
  const can = (permission) => {
    if (!role) return false;
    const allowed = PERMISSION_MAP[permission];
    if (!allowed) {
      // Unknown permission — fail closed in production, warn in dev
      if (import.meta.env.DEV) {
        console.warn(`[useRole] Unknown permission: "${permission}". Add it to PERMISSION_MAP.`);
      }
      return false;
    }
    return allowed.includes(role);
  };

  /**
   * canAny(permissions[]) → boolean
   * Returns true if the user holds at least one of the given permissions.
   */
  const canAny = (permissions) => permissions.some(can);

  /**
   * canAll(permissions[]) → boolean
   * Returns true only if the user holds ALL of the given permissions.
   */
  const canAll = (permissions) => permissions.every(can);

  return {
    role,
    can,
    canAny,
    canAll,
    isAdmin:       role === 'Admin',
    isTeacher:     role === 'Teacher',
    isParticipant: role === 'Participant',
  };
}
