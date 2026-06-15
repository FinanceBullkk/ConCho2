/**
 * Unit tests for the capability authz scaffold (M4).
 *
 * The capability map is pure → no DB. The middleware is exercised with plain
 * req/res/next stubs.
 */

const {
  CAPABILITIES,
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
  roleHasCapability,
  actorHasCapability,
  capabilitiesForRole,
  setLiveGrants,
  getLiveGrants,
} = require('../../policy/capabilities');
const { requireCapability } = require('../../middleware/requireCapability');

const admin = { _id: 'a', role: 'Admin' };
const coordinator = { _id: 'c', role: 'Coordinator' };
const teacher = { _id: 't', role: 'Teacher' };
const participant = { _id: 'p', role: 'Participant' };

describe('policy/capabilities — role → capability map', () => {
  test('Admin is a superuser (holds every capability)', () => {
    Object.values(CAPABILITIES).forEach((cap) => {
      expect(roleHasCapability('Admin', cap)).toBe(true);
    });
  });

  test('Teacher is read-only on learning (no program/cohort/session writes)', () => {
    expect(roleHasCapability('Teacher', CAPABILITIES.ENROLLMENT_READ)).toBe(true);
    expect(roleHasCapability('Teacher', CAPABILITIES.PROGRAM_MANAGE)).toBe(false);
    expect(roleHasCapability('Teacher', CAPABILITIES.COHORT_MANAGE)).toBe(false);
    expect(roleHasCapability('Teacher', CAPABILITIES.SESSION_BOOK)).toBe(false);
    expect(roleHasCapability('Teacher', CAPABILITIES.ENROLLMENT_SELF)).toBe(false);
  });

  test('Participant can book sessions and self-enroll, but not manage', () => {
    expect(roleHasCapability('Participant', CAPABILITIES.SESSION_BOOK)).toBe(true);
    expect(roleHasCapability('Participant', CAPABILITIES.ENROLLMENT_SELF)).toBe(true);
    expect(roleHasCapability('Participant', CAPABILITIES.ENROLLMENT_READ)).toBe(true);
    expect(roleHasCapability('Participant', CAPABILITIES.PROGRAM_MANAGE)).toBe(false);
    expect(roleHasCapability('Participant', CAPABILITIES.ENROLLMENT_MANAGE)).toBe(false);
  });

  // ── Coordinator (re-center Phase 1) — training-ops bundle ──
  test('Coordinator holds the training-ops management bundle', () => {
    [
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
    ].forEach((cap) => {
      expect(roleHasCapability('Coordinator', cap)).toBe(true);
    });
  });

  test('Coordinator excludes org placement + department writes (Admin-only)', () => {
    expect(roleHasCapability('Coordinator', CAPABILITIES.ORG_MANAGE)).toBe(false);
    expect(roleHasCapability('Coordinator', CAPABILITIES.DEPARTMENT_MANAGE)).toBe(false);
  });

  test('Coordinator excludes learner-self / feedback / assessment surfaces (v1 bundle)', () => {
    expect(roleHasCapability('Coordinator', CAPABILITIES.ENROLLMENT_SELF)).toBe(false);
    expect(roleHasCapability('Coordinator', CAPABILITIES.FEEDBACK_SUBMIT)).toBe(false);
    expect(roleHasCapability('Coordinator', CAPABILITIES.FEEDBACK_READ)).toBe(false);
    expect(roleHasCapability('Coordinator', CAPABILITIES.ASSESSMENT_MANAGE)).toBe(false);
    expect(roleHasCapability('Coordinator', CAPABILITIES.ASSESSMENT_ATTEMPT)).toBe(false);
  });

  test('Coordinator is an explicit allow-list, never the full Admin set', () => {
    expect(capabilitiesForRole('Coordinator').length).toBeLessThan(ALL_CAPABILITIES.length);
  });

  test('Teacher gains office.read but not office.manage; Participant has neither', () => {
    expect(roleHasCapability('Teacher', CAPABILITIES.OFFICE_READ)).toBe(true);
    expect(roleHasCapability('Teacher', CAPABILITIES.OFFICE_MANAGE)).toBe(false);
    expect(roleHasCapability('Participant', CAPABILITIES.OFFICE_READ)).toBe(false);
    expect(roleHasCapability('Participant', CAPABILITIES.OFFICE_MANAGE)).toBe(false);
  });

  test('unknown role / unknown capability → false', () => {
    expect(roleHasCapability('Ghost', CAPABILITIES.PROGRAM_MANAGE)).toBe(false);
    expect(roleHasCapability('Admin', 'made.up')).toBe(false);
  });

  test('actorHasCapability safe-denies a missing actor', () => {
    expect(actorHasCapability(null, CAPABILITIES.PROGRAM_MANAGE)).toBe(false);
    expect(actorHasCapability(admin, CAPABILITIES.PROGRAM_MANAGE)).toBe(true);
  });

  test('capabilitiesForRole returns a defensive copy', () => {
    const caps = capabilitiesForRole('Participant');
    caps.push('mutated');
    expect(capabilitiesForRole('Participant')).not.toContain('mutated');
  });
});

describe('policy/capabilities — editable live grants store (gap #2)', () => {
  // Restore the static scaffold after each mutation so no other suite is affected.
  afterEach(() => setLiveGrants(ROLE_CAPABILITIES));

  test('setLiveGrants changes what a role holds', () => {
    expect(roleHasCapability('Teacher', CAPABILITIES.PROGRAM_MANAGE)).toBe(false);
    setLiveGrants({ ...ROLE_CAPABILITIES, Teacher: [CAPABILITIES.PROGRAM_MANAGE] });
    expect(roleHasCapability('Teacher', CAPABILITIES.PROGRAM_MANAGE)).toBe(true);
    expect(roleHasCapability('Teacher', CAPABILITIES.ENROLLMENT_READ)).toBe(false); // replaced, not merged
  });

  test('Admin grants are immutable (lockout-proof) even if edited away', () => {
    setLiveGrants({ Admin: [], Teacher: [] }); // try to strip Admin
    Object.values(CAPABILITIES).forEach((cap) => {
      expect(roleHasCapability('Admin', cap)).toBe(true);
    });
  });

  test('a custom role grants exactly its capabilities', () => {
    setLiveGrants({ ...ROLE_CAPABILITIES, Auditor: [CAPABILITIES.AUDIT_READ, CAPABILITIES.REPORT_READ] });
    expect(roleHasCapability('Auditor', CAPABILITIES.AUDIT_READ)).toBe(true);
    expect(roleHasCapability('Auditor', CAPABILITIES.PROGRAM_MANAGE)).toBe(false);
  });

  test('getLiveGrants returns plain arrays incl. the full Admin set', () => {
    const grants = getLiveGrants();
    expect(Array.isArray(grants.Admin)).toBe(true);
    expect(grants.Admin.length).toBe(ALL_CAPABILITIES.length);
  });
});

describe('middleware/requireCapability', () => {
  const run = (user, ...caps) => {
    const req = { user };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    const next = jest.fn();
    requireCapability(...caps)(req, res, next);
    return { res, next };
  };

  test('calls next() when the role holds the capability', () => {
    const { res, next } = run(admin, CAPABILITIES.PROGRAM_MANAGE);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test('Coordinator passes office.manage but not org.manage', () => {
    const ok = run(coordinator, CAPABILITIES.OFFICE_MANAGE);
    expect(ok.next).toHaveBeenCalledTimes(1);

    const denied = run(coordinator, CAPABILITIES.ORG_MANAGE);
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.statusCode).toBe(403);
  });

  test('401 when there is no authenticated user', () => {
    const { res, next } = run(null, CAPABILITIES.PROGRAM_MANAGE);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test('403 when the role lacks the capability', () => {
    const { res, next } = run(teacher, CAPABILITIES.PROGRAM_MANAGE);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('any-of: passes if the role holds at least one listed capability', () => {
    // enrollment route allows admin-manage OR learner-self.
    const asParticipant = run(participant, CAPABILITIES.ENROLLMENT_MANAGE, CAPABILITIES.ENROLLMENT_SELF);
    expect(asParticipant.next).toHaveBeenCalledTimes(1);

    const asTeacher = run(teacher, CAPABILITIES.ENROLLMENT_MANAGE, CAPABILITIES.ENROLLMENT_SELF);
    expect(asTeacher.next).not.toHaveBeenCalled();
    expect(asTeacher.res.statusCode).toBe(403);
  });
});
