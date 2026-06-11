/**
 * Capability Guard (M4 — capability-based authz scaffold)
 * ──────────────────────────────────────────────────────
 * Coarse authorization middleware, the capability-based sibling of
 * `roleGuard`. A route declares the capability it needs rather than the roles
 * allowed:
 *
 *   router.post('/programs', protect, requireCapability('program.manage'), create)
 *
 * Variadic = ANY-OF (like roleGuard's role list). A route open to either an
 * admin acting on others or a learner acting on themselves:
 *
 *   requireCapability('enrollment.manage', 'enrollment.self')
 *
 * Must run AFTER `protect` (needs req.user). Resource-level "this doc" checks
 * still happen later in the use-case / policy layer — this only answers
 * "may this actor perform this kind of action at all?".
 */

const { roleHasCapability } = require('../policy/capabilities');

const requireCapability = (...capabilities) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized — must be logged in',
    });
  }

  const allowed = capabilities.some((cap) => roleHasCapability(req.user.role, cap));
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user.role}' lacks the required capability: ${capabilities.join(' or ')}`,
    });
  }

  next();
};

module.exports = { requireCapability };
