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
    CAPABILITIES.ASSIGNMENT_MANAGE,
    CAPABILITIES.PATH_READ,
    CAPABILITIES.PATH_MANAGE,
    CAPABILITIES.DEPARTMENT_READ,
    CAPABILITIES.OFFICE_READ,
    CAPABILITIES.OFFICE_MANAGE,
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
    CAPABILITIES.PATH_READ,
    CAPABILITIES.DEPARTMENT_READ,
    CAPABILITIES.OFFICE_READ,
    CAPABILITIES.TEAM_READ,
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
    CAPABILITIES.PATH_READ,
    // A Participant can lead/manage others (e.g. team lead), so they may
    // read their own direct reports. Endpoint is self-scoped — safe.
    CAPABILITIES.TEAM_READ,
  ]),
});

/**
 * Does a role hold a capability?
 * @param {string} role - 'Admin' | 'Coordinator' | 'Teacher' | 'Participant'
 * @param {string} capability - one of CAPABILITIES
 * @returns {boolean}
 */
const roleHasCapability = (role, capability) => {
  const caps = ROLE_CAPABILITIES[role];
  return Array.isArray(caps) && caps.includes(capability);
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
 * All capabilities a role holds (defensive copy). Useful for surfacing the set
 * (e.g. to a client) later — unused by the scaffold itself.
 * @param {string} role
 * @returns {string[]}
 */
const capabilitiesForRole = (role) => [...(ROLE_CAPABILITIES[role] || [])];

module.exports = {
  CAPABILITIES,
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
  roleHasCapability,
  actorHasCapability,
  capabilitiesForRole,
};
