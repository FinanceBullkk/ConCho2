/**
 * Role-based Access Guard
 * ────────────────────────
 * Factory function — accepts allowed roles and returns middleware.
 * Must be used AFTER protect middleware.
 *
 * Usage: router.post('/admin-only', protect, roleGuard('Admin'), handler)
 *        router.put('/staff', protect, roleGuard('Admin', 'Teacher'), handler)
 */
const roleGuard = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — must be logged in',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized. Required: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
};

module.exports = { roleGuard };
