/**
 * Unit tests for the capability authz scaffold (M4).
 *
 * The capability map is pure → no DB. The middleware is exercised with plain
 * req/res/next stubs.
 */

const {
  CAPABILITIES,
  roleHasCapability,
  actorHasCapability,
  capabilitiesForRole,
} = require('../../policy/capabilities');
const { requireCapability } = require('../../middleware/requireCapability');

const admin = { _id: 'a', role: 'Admin' };
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
