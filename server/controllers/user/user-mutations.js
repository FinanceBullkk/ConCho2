const bcrypt = require('bcryptjs');
const { invalidateUserCache } = require('../../middleware/auth');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const repository = require('./user-mutations-repository');

// ──────────────────────────────────────────────────────────
// User Controller — create/update handlers (Admin only)
// ──────────────────────────────────────────────────────────
// Split from the legacy userController (Phase 1 modular-monolith).
// updateUser carries the BUG #9 re-auth gate for sensitive privilege
// changes (password/role) on OTHER users.
//
// empCode and email are admin-provided (Zod schema enforces both as
// required). No auto-generation — the admin owns the numbering scheme
// and email assignments do not follow a pattern.

/**
 * POST /api/users
 * Create a new user.
 */
const createUser = async (req, res) => {
  try {
    // BUG #13 fix: entranceLevel and currentLevel are part of the Zod
    // schema and the User model, but were previously dropped here —
    // admins setting these on create got a 201 with the fields silently
    // ignored.
    const {
      empCode, name, email, role, department, position, status, dropReason,
      entranceLevel, currentLevel, password, customFields,
    } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'password is required' });
    }

    const user = await repository.create({
      empCode,
      name,
      email,
      role,
      department,
      position,
      status,
      dropReason,
      entranceLevel,
      currentLevel,
      password,
      ...(customFields && typeof customFields === 'object' ? { customFields } : {}),
    });

    // Return without password
    const userObj = user.toObject();
    delete userObj.password;

    auditService.record({
      req,
      action: 'created',
      entity: 'User',
      entityId: user._id,
      diff: { after: auditService.stripSensitive(userObj) },
    });

    invalidateAnalyticsCache();
    res.status(201).json({ success: true, data: userObj });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/users/:id
 * Update a user
 *
 * IMPORTANT: Uses findOneAndUpdate which triggers the
 * Auto-Release middleware in User.js when status → 'Dropped'
 */
const updateUser = async (req, res) => {
  try {
    // BUG #13 fix: include entranceLevel + currentLevel — previously
    // updates to these fields via API were silent no-ops.
    const {
      empCode, name, email, role, department, position, status, dropReason,
      entranceLevel, currentLevel, customFields,
    } = req.body;
    const updateData = {};

    if (empCode !== undefined) updateData.empCode = empCode;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (status !== undefined) updateData.status = status;
    if (dropReason !== undefined) updateData.dropReason = dropReason;
    if (entranceLevel !== undefined) updateData.entranceLevel = entranceLevel;
    if (currentLevel !== undefined) updateData.currentLevel = currentLevel;
    // Admin-defined custom fields (entity='User') — stored as a value map.
    if (customFields !== undefined && typeof customFields === 'object') updateData.customFields = customFields;

    // Snapshot before-state for audit diff (lean to keep it cheap).
    const before = await repository.findByIdLean(req.params.id);
    if (!before) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ── BUG #9 fix: Re-auth gate on sensitive privilege changes ──
    // Previously any Admin could reset another user's password or change
    // anyone's role without re-authenticating, so a single compromised
    // admin session = full org takeover. Now: when the target user is
    // SOMEONE ELSE and the request mutates `password` or `role`, the
    // acting admin must re-prove their identity by supplying their own
    // `currentPassword` in the request body.
    const isSelf = before._id.toString() === req.user._id.toString();
    const sensitiveChange =
      !!req.body.password ||
      (role !== undefined && role !== before.role);

    if (!isSelf && sensitiveChange) {
      if (!req.body.currentPassword) {
        return res.status(403).json({
          success: false,
          message: 'currentPassword is required to change password or role for another user',
          requiresReauth: true,
        });
      }
      // Verify the acting admin's password. Use `+password` because the
      // User schema hides password by default.
      const acting = await repository.findByIdWithPassword(req.user._id);
      if (!acting) {
        return res.status(401).json({ success: false, message: 'Session user not found' });
      }
      const ok = await bcrypt.compare(req.body.currentPassword, acting.password || '');
      if (!ok) {
        // Note: audit log captures the failed re-auth attempt.
        auditService.record({
          req,
          action: 'reauth-failed',
          entity: 'User',
          entityId: before._id,
          note: 'currentPassword verification failed for privilege change',
        });
        return res.status(403).json({
          success: false,
          message: 'currentPassword does not match',
          requiresReauth: true,
        });
      }
    }

    // If password is being changed, hash it manually
    // (pre-save hooks don't run on findOneAndUpdate)
    if (req.body.password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(req.body.password, salt);
      updateData.passwordChangedAt = new Date();
    }

    const user = await repository.updateById(req.params.id, updateData);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Invalidate auth cache so status changes take effect immediately
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'updated',
      entity: 'User',
      entityId: user._id,
      diff: auditService.diff(before, user.toObject()),
    });

    invalidateAnalyticsCache();
    res.json({ success: true, data: user });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { createUser, updateUser };
