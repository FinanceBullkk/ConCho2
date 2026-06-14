const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES, ALL_CAPABILITIES, capabilitiesForRole } = require('../policy/capabilities');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Access (Roles & capabilities) — read-only surface (Studio ▸ Roles & access).
//
// Exposes the LIVE, server-enforced coarse-authz matrix (policy/capabilities.js)
// so an admin can see who-can-do-what. Capabilities are derived from role (no
// per-user/db-stored grants yet), so this surface is read-only by design — it
// reflects enforcement, it does not change it. Admin-only (SETTINGS_MANAGE).
// ──────────────────────────────────────────────────────────

const ROLES = ['Admin', 'Coordinator', 'Teacher', 'Participant'];

router.use(protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE));

// GET /api/access/capability-matrix
// → { roles, capabilities, grants: { <role>: [capabilityId, …] } }
router.get('/capability-matrix', (req, res) => {
  try {
    const grants = {};
    ROLES.forEach((role) => { grants[role] = capabilitiesForRole(role); });
    res.json({
      success: true,
      data: { roles: ROLES, capabilities: [...ALL_CAPABILITIES], grants },
    });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;
