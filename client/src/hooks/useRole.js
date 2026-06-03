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

// ──────────────────────────────────────────────────────────
// Permission → roles that hold it.
// AUDIT PR 8 (AUTHZ-003 / FE-002): this matrix was drifting from the
// server's actual route guards. Teachers used to see schedule create/
// update + read-users buttons that 403'd on submit. Each row below is
// now anchored to a specific server route file — if you add a perm
// here, name the route at end-of-line so future drift is obvious.
// ──────────────────────────────────────────────────────────
const PERMISSION_MAP = {
  // User management ─ server: server/routes/userRoutes.js
  'create:user':       ['Admin'],                  // POST   /api/users
  'update:user':       ['Admin'],                  // PUT    /api/users/:id
  'delete:user':       ['Admin'],                  // DELETE /api/users/:id
  'read:users':        ['Admin'],                  // GET    /api/users  (Admin-only at route)
  'force-logout:user': ['Admin'],                  // POST   /api/auth/admin/force-logout/:userId
  'disable-mfa:user':  ['Admin'],                  // POST   /api/auth/mfa/admin-disable/:userId

  // Class management ─ server: server/routes/classRoutes.js
  'create:class':      ['Admin'],                  // POST   /api/classes
  'update:class':      ['Admin'],                  // PUT    /api/classes/:id
  'delete:class':      ['Admin'],                  // DELETE /api/classes/:id
  'read:classes':      ['Admin', 'Teacher', 'Participant'], // GET /api/classes

  // Schedule management ─ server: server/routes/scheduleRoutes.js
  // Teacher does NOT have schedule write — admin-only on book/admin-create/update/delete.
  // (The server route mounts roleGuard('Admin','Participant') on book-slot and
  // roleGuard('Admin') on admin-create / update / delete.)
  'create:schedule':   ['Admin'],                  // POST   /api/schedules (admin-create)
  'update:schedule':   ['Admin'],                  // PUT    /api/schedules/:id
  'delete:schedule':   ['Admin'],                  // DELETE /api/schedules/:id
  'read:schedules':    ['Admin', 'Teacher', 'Participant'], // GET /api/schedules (Teacher scoped server-side)

  // Attendance ─ server: server/routes/attendanceRoutes.js
  'record:attendance': ['Admin', 'Teacher'],       // POST /api/attendance/:scheduleId
  'read:attendance':   ['Admin', 'Teacher'],       // GET  /api/attendance/schedule/:id, analytics/*

  // Team management ─ server: server/routes/teamRoutes.js
  // Teacher does NOT have team read at the API — only Admin (+ Participant /my-teams).
  'create:team':       ['Admin'],                  // POST   /api/teams
  'update:team':       ['Admin'],                  // PUT    /api/teams/:id
  'delete:team':       ['Admin'],                  // DELETE /api/teams/:id
  'read:teams':        ['Admin', 'Participant'],   // GET /api/teams (Admin) + /my-teams (Participant)

  // Enrollment ─ server: server/routes/enrollmentRoutes.js (Admin-only)
  'manage:enrollment': ['Admin'],

  // Learning platform ─ server: server/domains/learning/routes.js
  // Program/cohort writes are roleGuard('Admin'); reads are any authed user.
  'create:program':  ['Admin'],                    // POST   /api/learning/programs
  'update:program':  ['Admin'],                    // PUT    /api/learning/programs/:id
  'archive:program': ['Admin'],                    // DELETE /api/learning/programs/:id
  'create:cohort':   ['Admin'],                    // POST   /api/learning/cohorts
  'read:learning':   ['Admin', 'Teacher', 'Participant'], // GET /api/learning/*
  // Enrolling another learner is Admin-only; learners self-enroll server-side
  // (gated by program schedulingMode), not via this UI permission.
  'enroll:learner':  ['Admin'],                    // POST/DELETE /api/learning/enrollments

  // Bookings ─ server: server/routes/scheduleRoutes.js POST /book-slot
  // roleGuard('Admin','Participant') + leader check in scheduleService
  'book:class':        ['Admin', 'Participant'],

  // Evaluations ─ server: server/routes/evaluationRoutes.js
  // Teacher write is now ALSO gated by Class.teacherIds policy (audit PR 5)
  'create:evaluation': ['Admin', 'Teacher'],       // POST /api/evaluations
  'read:evaluations':  ['Admin', 'Teacher', 'Participant'], // GET /api/evaluations (Participant scoped server-side)
  'delete:evaluation': ['Admin'],                  // DELETE /api/evaluations/:id

  // Admin panel ─ Admin-only
  'access:admin':      ['Admin'],
  'run:reconcile':     ['Admin'],                  // POST /api/admin/reconcile/run
  'read:audit':        ['Admin'],                  // GET  /api/admin/audit/*
  'read:database':     ['Admin'],                  // GET  /api/admin-db/*
  'manage:settings':   ['Admin'],                  // PUT  /api/settings

  // Export / import ─ Admin-only
  'export:data':       ['Admin'],                  // GET  /api/export/*
  'import:data':       ['Admin'],                  // POST /api/import/*
  'sync:sheets':       ['Admin'],                  // POST /api/sync/google-sheets
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
