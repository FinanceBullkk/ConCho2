const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Role — DB-backed capability grants + custom roles (TMS.update gap #2).
//
// The coarse-authz matrix (policy/capabilities.js) was a static role→capability
// map. This persists the grants so an admin can EDIT them and define CUSTOM
// roles, without code. System roles (Admin/Coordinator/Teacher/Participant) are
// seeded from the static map on first boot; `key` matches `User.role` for them.
// Grants load into the in-memory `liveGrants` store so `roleHasCapability`
// stays sync. Admin's grants are immutable (superuser, lockout-proof).
// ──────────────────────────────────────────────────────────
const roleSchema = new mongoose.Schema(
  {
    // Role key — matches `User.role` for system roles; a snake/Pascal id for
    // custom roles. Unique among live (non-deleted) roles.
    key: {
      type: String,
      required: [true, 'Role key is required'],
      trim: true,
    },
    name: { type: String, required: [true, 'Role name is required'], trim: true },
    // Built-in roles: cannot be deleted; Admin grants cannot be changed.
    system: { type: Boolean, default: false },
    // Held capability ids (subset of ALL_CAPABILITIES).
    capabilities: { type: [String], default: [] },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One live role per key; a deleted custom-role key can be re-created.
roleSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

module.exports = mongoose.model('Role', roleSchema);
