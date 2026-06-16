const mongoose = require('mongoose');
const mongoSanitize = require('express-mongo-sanitize');
const { protect } = require('../middleware/auth');
const { requireCapability } = require('../middleware/requireCapability');
const { CAPABILITIES } = require('../policy/capabilities');
const { escapeRegex } = require('../helpers/escapeRegex');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');
const router = require('express').Router();

// ──────────────────────────────────────────────────────────
// Admin Database Explorer API (Hardened — SEC-INJ-01/02, SEC-ADD-02/03,
// and audit PR 3 → SEC-003 + SEC-010)
// ──────────────────────────────────────────────────────────
// Generic CRUD for any registered Mongoose model. Admin-only.
// Powers the "Database" tab in the Data page.
//
// SECURITY HARDENING:
//   - Parsed JSON filters are re-sanitized (SEC-INJ-01)
//   - Search input is regex-escaped (SEC-INJ-02)
//   - Sensitive fields are blacklisted on update (SEC-ADD-02 + audit SEC-003)
//   - Hard delete is restricted to non-critical collections (SEC-ADD-03 +
//     audit SEC-010)
//   - Every mutation writes an AuditLog row with full before/after diff
//     so forensic queries can reconstruct who flipped what (audit SEC-003)
// ──────────────────────────────────────────────────────────

router.use(protect, requireCapability(CAPABILITIES.SYSTEM_OPS));

// Allowed models (whitelist for safety)
const ALLOWED_MODELS = [
  'User', 'Team', 'Class', 'Schedule',
  'Attendance', 'Enrollment', 'Evaluation',
  'LearningProgram', 'Counter', 'Setting',
];

// ── Security: Fields that MUST NOT be modified via generic update ──
// These fields require dedicated endpoints with proper validation,
// hashing (passwords), or cascade logic (soft-delete flags).
//
// Audit PR 3 (SEC-003): expanded to cover every auth / MFA / lockout
// field. A compromised admin session previously could flip mfaEnabled,
// inject a passwordResetToken, or rewrite email to silently take over
// any account — all without triggering the userController re-auth gate
// at userController.js:215-245. Each field below MUST stay listed.
const FORBIDDEN_UPDATE_FIELDS = [
  // Auth (existing — bcrypt + token revocation)
  'password', 'passwordChangedAt',

  // Soft-delete (existing — requires cascade)
  'isDeleted', 'deletedAt',

  // Role (existing — privilege escalation)
  'role',

  // ── Added in audit PR 3 (SEC-003) ──────────────────────────────────
  // MFA: flipping these silently disables second factor for the victim
  'mfaEnabled', 'mfaSecret', 'mfaBackupCodes',
  'mfaPendingSecret', 'mfaPendingSecretExpires', 'mfaLastUsedCounter',

  // Password reset: injecting a known token bypasses email delivery
  'passwordResetToken', 'passwordResetExpires',

  // Lockout: zeroing these unblocks a brute-forced account
  'failedLoginAttempts', 'lockUntil',

  // Forced password change: clearing this bypasses the mustChangePassword
  // middleware lockdown (auth.js:151-165)
  'mustChangePassword',

  // Identity: changing these is an account-swap primitive that defeats
  // every audit trail. Use dedicated PUT /api/users/:id (which re-auths).
  'email', 'empCode',
];

// ── Security: Collections that cannot be hard-deleted via this API ──
// Hard delete on these skips cascade cleanup (orphaned refs) or
// destroys integrity-critical metadata.
// Use dedicated endpoints (DELETE /api/users/:id, etc.) instead.
const HARD_DELETE_BLOCKED = [
  // Existing — cascade required
  'User', 'Team', 'Class', 'LearningProgram', 'Schedule',

  // ── Added in audit PR 3 (SEC-010) ──────────────────────────────────
  // Counter — deleting the sequence document resets empCode/classCode
  // generation to 1, creating duplicate codes on the next import.
  'Counter',

  // Setting — keys are referenced by booking validation, time-slot
  // enforcement, and dashboard cache TTL. Use PUT /api/settings (which
  // applies the ALLOWED_SETTING_KEYS whitelist) instead.
  'Setting',

  // Attendance / Enrollment / Evaluation — historical roll-call,
  // enrollment audit trail, and grading record. Hard delete destroys
  // compliance history and silently invalidates downstream reports.
  // Future: when a soft-delete pattern lands on these collections,
  // remove them here and add an admin-confirmable purge endpoint.
  'Attendance', 'Enrollment', 'Evaluation',
];

// Resolve model name from param (case-insensitive)
const resolveModel = (name) => {
  const match = ALLOWED_MODELS.find(m => m.toLowerCase() === name.toLowerCase());
  if (!match) return null;
  try { return mongoose.model(match); }
  catch { return null; }
};

const matchModelName = (name) =>
  ALLOWED_MODELS.find(m => m.toLowerCase() === name.toLowerCase()) || null;

// GET /api/admin-db/collections — List all collection stats
router.get('/collections', async (_req, res) => {
  try {
    const stats = [];
    for (const name of ALLOWED_MODELS) {
      try {
        const Model = mongoose.model(name);
        const count = await Model.countDocuments();
        const schema = Model.schema;
        const fields = Object.keys(schema.paths).filter(f => f !== '__v');
        stats.push({ name, count, fields });
      } catch {
        // Model not registered, skip
      }
    }
    res.json({ success: true, data: stats });
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/admin-db/:collection — Query documents
router.get('/:collection', async (req, res) => {
  try {
    const Model = resolveModel(req.params.collection);
    if (!Model) return res.status(404).json({ success: false, message: `Collection "${req.params.collection}" not found` });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;
    const sort = req.query.sort || '-createdAt';
    const search = req.query.search || '';

    // Build filter from query.filter (JSON string)
    // SEC-INJ-01: Re-sanitize the PARSED filter object to strip
    // MongoDB operators ($gt, $regex, etc.) that bypass the global
    // express-mongo-sanitize middleware (which only sanitizes raw query strings).
    let filter = {};
    if (req.query.filter) {
      try {
        const raw = JSON.parse(req.query.filter);
        filter = mongoSanitize.sanitize(raw);
      } catch { /* ignore bad filter */ }
    }

    // Include soft-deleted if requested
    if (req.query.includeDeleted === 'true') {
      // Don't add isDeleted filter
    } else {
      // Default: exclude soft-deleted
      filter.isDeleted = { $ne: true };
    }

    // Simple text search across string fields
    // SEC-INJ-02: Escape regex metacharacters to prevent ReDoS
    // and wildcard-match attacks (e.g. ".*" matching all docs).
    if (search) {
      const safeSearch = escapeRegex(search);
      const stringPaths = Object.entries(Model.schema.paths)
        .filter(([, v]) => v.instance === 'String')
        .map(([k]) => k);
      if (stringPaths.length > 0) {
        filter.$or = stringPaths.map(field => ({
          [field]: { $regex: safeSearch, $options: 'i' }
        }));
      }
    }

    const [docs, total] = await Promise.all([
      Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Model.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: docs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Audit helper — picks an entity name acceptable by AuditLog enum.
// Counter is added to the enum in this PR; Setting/User/etc. already exist.
const auditEntityFor = (modelName) => {
  // AuditLog.entity enum (see models/AuditLog.js) accepts these exact names.
  const known = new Set([
    'User', 'Team', 'Class', 'Schedule', 'Attendance', 'Evaluation',
    'Enrollment', 'Setting', 'Counter',
  ]);
  return known.has(modelName) ? modelName : 'AdminDb';
};

// PUT /api/admin-db/:collection/:id — Update a single document
router.put('/:collection/:id', async (req, res) => {
  try {
    const Model = resolveModel(req.params.collection);
    if (!Model) return res.status(404).json({ success: false, message: 'Collection not found' });
    const matchedModel = matchModelName(req.params.collection);

    // Strip protected fields
    const { _id, __v, createdAt, ...updateData } = req.body;

    // SEC-ADD-02 + audit SEC-003: Remove sensitive fields that require
    // dedicated endpoints with proper validation/hashing/cascade logic.
    const stripped = [];
    for (const field of FORBIDDEN_UPDATE_FIELDS) {
      if (field in updateData) {
        delete updateData[field];
        stripped.push(field);
      }
    }

    // Audit PR 3 (SEC-003): capture the pre-update document so we can
    // record the actual diff (post-strip). Without this, a hostile admin
    // could mutate a field and leave only an "I called the endpoint" trace.
    const before = await Model.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ success: false, message: 'Document not found' });

    const doc = await Model.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).lean();

    // Fire audit write (non-blocking — see auditService.js docs)
    auditService.record({
      req,
      action: 'db-admin-updated',
      entity: auditEntityFor(matchedModel),
      entityId: req.params.id,
      diff: auditService.diff(before, doc),
      note: stripped.length
        ? `adminDb PUT ${matchedModel}; ignored protected fields: ${stripped.join(', ')}`
        : `adminDb PUT ${matchedModel}`,
    });

    const response = { success: true, data: doc };
    if (stripped.length > 0) {
      response.warning = `Ignored protected fields: ${stripped.join(', ')}. Use dedicated endpoints to modify these.`;
    }
    res.json(response);
  } catch (err) {
    // PUT validation errors stay a client-facing 400 with the message (a
    // Mongoose ValidationError/CastError here IS a client mistake); only the
    // unexpected-500 paths were leaking internals — those now use handleError.
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin-db/:collection/:id — Hard delete a document
// SEC-ADD-03 + audit SEC-010: Restricted to non-critical collections.
// Core entities (User, Team, Class, Schedule, Counter, Setting, Attendance,
// Enrollment, Evaluation) MUST use their dedicated DELETE endpoints which
// run proper cascade cleanup and preserve historical / referential integrity.
router.delete('/:collection/:id', async (req, res) => {
  try {
    const Model = resolveModel(req.params.collection);
    if (!Model) return res.status(404).json({ success: false, message: 'Collection not found' });

    const matchedModel = matchModelName(req.params.collection);
    if (HARD_DELETE_BLOCKED.includes(matchedModel)) {
      return res.status(403).json({
        success: false,
        message: `Hard delete is disabled for "${matchedModel}". Use the dedicated DELETE /api/${matchedModel.toLowerCase()}s/:id endpoint for safe deletion with cascade cleanup.`,
      });
    }

    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    auditService.record({
      req,
      action: 'db-admin-deleted',
      entity: auditEntityFor(matchedModel),
      entityId: req.params.id,
      diff: auditService.diff(doc.toObject ? doc.toObject() : doc, {}),
      note: `adminDb DELETE ${matchedModel}`,
    });

    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
