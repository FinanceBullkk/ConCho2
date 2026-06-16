/**
 * ──────────────────────────────────────────────────────────
 * server/policy/capabilities.js  (M4 — capability-based authz scaffold)
 * ──────────────────────────────────────────────────────────
 * The coarse authorization question — "can this actor perform this kind of
 * action at all?" — is moving from hard-coded roles toward named capabilities.
 *
 * Why: as the platform grows from English-class booking into a generic L&D
 * platform with many program types, routes that ask `roleGuard('Admin')` don't
 * compose. A capability layer lets a route declare WHAT it needs
 * (`program.manage`, `session.book`) instead of WHO is allowed, so new flows
 * map to existing capabilities rather than multiplying role checks.
 *
 * This is the COARSE layer (paired with `middleware/requireCapability.js`),
 * exactly where `roleGuard` sat. Resource-level "can THIS actor touch THIS
 * doc?" checks still live in the per-resource policy modules + use-cases.
 *
 * Scaffold scope: capabilities are derived from the actor's role via a static
 * map (no per-user/db-stored grants yet). Admin is a superuser holding every
 * capability. The map is intentionally identical in effect to the learning
 * routes' previous `roleGuard` sets — wiring it in is behavior-preserving.
 *
 * Pure + HTTP-independent → unit-testable without a request or DB.
 */

// Canonical capability identifiers (dot-namespaced: `<resource>.<action>`).
const CAPABILITIES = Object.freeze({
  PROGRAM_MANAGE: 'program.manage',     // create / edit / archive LearningProgram
  COHORT_MANAGE: 'cohort.manage',       // create a Cohort (a run of a program)
  SESSION_BOOK: 'session.book',         // create / cancel a session
  ENROLLMENT_READ: 'enrollment.read',   // list cohort enrollments
  ENROLLMENT_MANAGE: 'enrollment.manage', // enroll / withdraw any learner (admin)
  ENROLLMENT_SELF: 'enrollment.self',   // self-enroll / self-withdraw (learner)
  COMPLETION_READ: 'completion.read',   // view completion status for a cohort
  CERTIFICATE_READ: 'certificate.read', // list issued certificates
  CERTIFICATE_MANAGE: 'certificate.manage', // issue / revoke certificates (admin)
  FEEDBACK_SUBMIT: 'feedback.submit',   // submit cohort feedback (learner self / admin)
  FEEDBACK_READ: 'feedback.read',       // list cohort feedback (own for learners)
  ASSESSMENT_MANAGE: 'assessment.manage', // author / archive assessments (admin/teacher)
  ASSESSMENT_READ: 'assessment.read',   // list/get assessments + attempts
  ASSESSMENT_ATTEMPT: 'assessment.attempt', // take an assessment (learner)
  REPORT_READ: 'report.read',           // cohort-wide completion reports + export (admin/teacher)
  ASSIGNMENT_READ: 'assignment.read',   // read mandatory assignments + due status
  ASSIGNMENT_SELF: 'assignment.self',   // read OWN assignments + own status (any role — Cohesion P3)
  ASSIGNMENT_MANAGE: 'assignment.manage', // create / archive mandatory assignments
  PATH_READ: 'path.read',               // browse learning paths + own path progress
  PATH_MANAGE: 'path.manage',           // create / edit / archive learning paths (admin)
  // ── Org model (Wave D3) ──────────────────────────────────
  DEPARTMENT_READ: 'department.read',   // list departments (admin/teacher — pickers, reports)
  DEPARTMENT_MANAGE: 'department.manage', // create / edit / archive departments (admin)
  ORG_MANAGE: 'org.manage',             // set a user's manager / department / office (admin)
  TEAM_READ: 'team.read',               // view OWN direct reports' training status (any role)
  // ── Offices (re-center Phase 1) ──────────────────────────
  OFFICE_READ: 'office.read',           // list offices (pickers, reports)
  OFFICE_MANAGE: 'office.manage',       // create / edit / archive offices (admin/coordinator)
  // ── Rooms + Trainers (re-center Phase 3) ─────────────────
  ROOM_READ: 'room.read',               // list Office-scoped rooms (scheduling picker — not learner-facing)
  ROOM_MANAGE: 'room.manage',           // create / edit / archive rooms (admin/coordinator)
  SESSION_ASSIGN_TRAINER: 'session.assign-trainer', // set a session's internal/external trainers (admin/coordinator)
  // ── In-app notifications (Cohesion P5) ───────────────────
  NOTIFICATION_READ: 'notification.read', // read OWN notification feed + mark read (any role — endpoints are self-scoped)
  // ── Skills / competency framework (TMS.update gap #4) ────
  SKILL_READ: 'skill.read',            // list skills + read OWN derived proficiency (self-scoped on learner read)
  SKILL_MANAGE: 'skill.manage',        // create/edit/archive skills + read role profiles + any learner's skills — Admin-only
  // ── Branding / template designer (TMS.update gap #5) ─────
  BRANDING_MANAGE: 'branding.manage',  // read/update tenant branding (org name, accent, logo, cert title) — Admin-only
  // ── Platform admin surfaces (Phase 0 authz finish) ───────
  // Migrated off roleGuard('Admin') so the whole app uses ONE coarse-authz
  // mechanism. Admin-ONLY (deliberately NOT added to the other role lists below);
  // Admin is superuser, so behaviour is identical to the previous roleGuard('Admin').
  USER_MANAGE: 'user.manage',          // create/update/delete/read users (userRoutes)
  ROLE_MANAGE: 'role.manage',          // edit role capability grants + custom roles (accessRoutes) — Admin-only
  AUTOMATION_MANAGE: 'automation.manage', // create/toggle no-code automation rules (automationRoutes) — Admin-only
  SETTINGS_MANAGE: 'settings.manage',  // read/update system settings (settingRoutes)
  DATA_TRANSFER: 'data.transfer',      // bulk import / export / Google-Sheets sync
  ANALYTICS_READ: 'analytics.read',    // admin dashboard stats/alerts/cache (dashboardRoutes)
  AUDIT_READ: 'audit.read',            // read the audit log (auditRoutes)
  SYSTEM_OPS: 'system.ops',            // DB explorer + reconciliation (adminDb/reconcile)
  COMPLIANCE_MANAGE: 'compliance.manage', // define required-training rules (A3; admin/coordinator)
  // ── Budget & cost management (TMS.update Modernization H1 — A1) ───────────
  // Gates BOTH read and write of finance data: budget figures are
  // management-sensitive, so reads do NOT roll into the broader report.read
  // (which Teachers hold) — Admin + Coordinator only, like the Admin-only
  // executive ROI screen the actuals also feed.
  BUDGET_MANAGE: 'budget.manage',      // CRUD cost entries + budgets, read roll-ups/variance (admin/coordinator)
  // ── Vendor & external-provider management (TMS.update Modernization H2 — A2) ─
  // Gates BOTH read and write of the vendor catalog: it carries contracts +
  // per-vendor spend (management-sensitive, like budget.manage) — Admin +
  // Coordinator only, NOT the broader report.read Teachers hold.
  VENDOR_MANAGE: 'vendor.manage',      // CRUD vendors + contracts + ratings, read spend (admin/coordinator)
});

const ALL_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES));

// Role → capabilities. Admin is a superuser (all capabilities). Coordinator
// (re-center Phase 1) is the training-ops role: an explicit allow-list of
// management capabilities — NEVER `ALL_CAPABILITIES`, and deliberately
// excludes user-account/security surfaces (those stay roleGuard('Admin'))
// plus org.manage (placing people in the org tree stays Admin). Teacher is
// read-oriented; Participant books sessions (leader booking) and self-enrolls.
const ROLE_CAPABILITIES = Object.freeze({
  Admin: ALL_CAPABILITIES,
  Coordinator: Object.freeze([
    CAPABILITIES.PROGRAM_MANAGE,
    CAPABILITIES.COHORT_MANAGE,
    CAPABILITIES.SESSION_BOOK,
    CAPABILITIES.ENROLLMENT_READ,
    CAPABILITIES.ENROLLMENT_MANAGE,
    CAPABILITIES.COMPLETION_READ,
    CAPABILITIES.CERTIFICATE_READ,
    CAPABILITIES.CERTIFICATE_MANAGE,
    CAPABILITIES.REPORT_READ,
    CAPABILITIES.ASSIGNMENT_READ,
    CAPABILITIES.ASSIGNMENT_SELF,
    CAPABILITIES.ASSIGNMENT_MANAGE,
    CAPABILITIES.PATH_READ,
    CAPABILITIES.PATH_MANAGE,
    CAPABILITIES.DEPARTMENT_READ,
    CAPABILITIES.OFFICE_READ,
    CAPABILITIES.OFFICE_MANAGE,
    CAPABILITIES.ROOM_READ,
    CAPABILITIES.ROOM_MANAGE,
    CAPABILITIES.SESSION_ASSIGN_TRAINER,
    CAPABILITIES.COMPLIANCE_MANAGE,
    CAPABILITIES.BUDGET_MANAGE,
    CAPABILITIES.VENDOR_MANAGE,
    CAPABILITIES.NOTIFICATION_READ,
    CAPABILITIES.SKILL_READ,
  ]),
  Teacher: Object.freeze([
    CAPABILITIES.ENROLLMENT_READ,
    CAPABILITIES.COMPLETION_READ,
    CAPABILITIES.CERTIFICATE_READ,
    CAPABILITIES.FEEDBACK_READ,
    CAPABILITIES.ASSESSMENT_MANAGE,
    CAPABILITIES.ASSESSMENT_READ,
    CAPABILITIES.REPORT_READ,
    CAPABILITIES.ASSIGNMENT_READ,
    CAPABILITIES.ASSIGNMENT_SELF,
    CAPABILITIES.PATH_READ,
    CAPABILITIES.DEPARTMENT_READ,
    CAPABILITIES.OFFICE_READ,
    CAPABILITIES.TEAM_READ,
    CAPABILITIES.NOTIFICATION_READ,
    CAPABILITIES.SKILL_READ,
  ]),
  Participant: Object.freeze([
    CAPABILITIES.SESSION_BOOK,
    CAPABILITIES.ENROLLMENT_READ,
    CAPABILITIES.ENROLLMENT_SELF,
    CAPABILITIES.COMPLETION_READ,
    CAPABILITIES.CERTIFICATE_READ,
    CAPABILITIES.FEEDBACK_SUBMIT,
    CAPABILITIES.FEEDBACK_READ,
    CAPABILITIES.ASSESSMENT_READ,
    CAPABILITIES.ASSESSMENT_ATTEMPT,
    // Own required-training view (Cohesion P3) — endpoint is self-scoped.
    CAPABILITIES.ASSIGNMENT_SELF,
    CAPABILITIES.PATH_READ,
    // A Participant can lead/manage others (e.g. team lead), so they may
    // read their own direct reports. Endpoint is self-scoped — safe.
    CAPABILITIES.TEAM_READ,
    // Own in-app notification feed (Cohesion P5) — endpoints are self-scoped.
    CAPABILITIES.NOTIFICATION_READ,
    // Own derived skill proficiency (learner read is self-scoped in the controller).
    CAPABILITIES.SKILL_READ,
  ]),
});

// ──────────────────────────────────────────────────────────
// Live grants store (TMS.update gap #2 — editable roles).
//
// `roleHasCapability` STAYS SYNC (it gates every domain route). It reads a
// module-level `liveGrants` ({ role → Set<capability> }) instead of the static
// map directly. `liveGrants` is INITIALISED from `ROLE_CAPABILITIES`, so until
// the DB-backed grants load (or are edited) behaviour is identical to the
// static scaffold. The boot loader (`domains/access`) calls `setLiveGrants`
// with DB-stored grants; role edits refresh it too.
//
// **Admin is always superuser** — `roleHasCapability('Admin', …)` returns true
// unconditionally, so no edit can ever lock Admin out of role management.
// ──────────────────────────────────────────────────────────
const buildGrants = (mapByRole) => {
  const grants = {};
  for (const [role, caps] of Object.entries(mapByRole)) {
    grants[role] = new Set(role === 'Admin' ? ALL_CAPABILITIES : caps);
  }
  grants.Admin = new Set(ALL_CAPABILITIES); // invariant: Admin holds everything
  return grants;
};

let liveGrants = buildGrants(ROLE_CAPABILITIES);

/**
 * Replace the live grants. `grantsByRole` = { roleKey: capability[] }. Admin is
 * always forced to the full set (lockout-proof). Called by the boot loader and
 * after every role edit.
 * @param {Object<string,string[]>} grantsByRole
 */
const setLiveGrants = (grantsByRole) => { liveGrants = buildGrants(grantsByRole); };

/** Current live grants as plain arrays ({ roleKey: capability[] }). */
const getLiveGrants = () =>
  Object.fromEntries(Object.entries(liveGrants).map(([role, set]) => [role, [...set]]));

/**
 * Does a role hold a capability? Reads the live grants. Admin holds every
 * capability by invariant (buildGrants always sets Admin = ALL_CAPABILITIES),
 * so Admin can never be locked out — without granting unknown/typo'd ids.
 * @param {string} role - role key (system or custom)
 * @param {string} capability - one of CAPABILITIES
 * @returns {boolean}
 */
const roleHasCapability = (role, capability) => {
  const set = liveGrants[role];
  return set instanceof Set && set.has(capability);
};

/**
 * Does an actor (req.user) hold a capability? Safe-deny for a missing actor.
 * @param {Object|null} actor - req.user (needs `role`)
 * @param {string} capability
 * @returns {boolean}
 */
const actorHasCapability = (actor, capability) =>
  Boolean(actor) && roleHasCapability(actor.role, capability);

/**
 * All capabilities a role holds (defensive copy), from the live grants.
 * @param {string} role
 * @returns {string[]}
 */
const capabilitiesForRole = (role) => [...(liveGrants[role] || [])];

module.exports = {
  CAPABILITIES,
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
  roleHasCapability,
  actorHasCapability,
  capabilitiesForRole,
  setLiveGrants,
  getLiveGrants,
};
