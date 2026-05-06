const AuditLog = require('../models/AuditLog');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Audit Service (Phase 1.1)
// ──────────────────────────────────────────────────────────
// Two design choices worth knowing:
//
// 1. Writes are FIRE-AND-FORGET (no await in callers). Audit must
//    never break the user's request. If the AuditLog write fails,
//    we log the error and move on. The trade-off is that a Mongo
//    outage could lose a few audit lines — acceptable since the
//    primary write would have failed anyway.
//
// 2. The diff() helper redacts sensitive fields BEFORE we hand the
//    object off to Mongo. Defense-in-depth: even if the caller
//    forgets to strip a password, the audit row won't carry it.
// ──────────────────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordChangedAt',
  'mfaSecret',
  'mfaBackupCodes',
  'token',
  'refreshToken',
  'jwtSecret',
]);

const stripSensitive = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      out[k] = stripSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
};

/**
 * Build a {before, after} diff for an update. Only includes keys that
 * actually changed — keeps audit rows compact.
 */
const diff = (before = {}, after = {}) => {
  const beforeSafe = stripSensitive(before);
  const afterSafe = stripSensitive(after);
  const changed = {};
  const keys = new Set([...Object.keys(beforeSafe), ...Object.keys(afterSafe)]);
  for (const k of keys) {
    const b = beforeSafe[k];
    const a = afterSafe[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changed[k] = { before: b, after: a };
    }
  }
  return Object.keys(changed).length ? changed : null;
};

/**
 * Extract actor + request context from an Express req. Safe to call
 * with a partial req (e.g. from background jobs that have no real request).
 */
const fromReq = (req) => ({
  actorId: req?.user?._id || null,
  actorRole: req?.user?.role || 'System',
  actorEmpCode: req?.user?.empCode || null,
  requestId: req?.id || null,
  ip: req?.ip || null,
  userAgent: req?.get?.('user-agent')?.slice(0, 200) || null,
});

/**
 * Record an audit event. Fire-and-forget — never throws into the caller.
 *
 * @param {Object} entry
 * @param {Object} entry.req       - Express request (for actor + correlation)
 * @param {string} entry.action    - 'created' | 'updated' | 'deleted' | ...
 * @param {string} entry.entity    - 'User' | 'Team' | 'Class' | ...
 * @param {string|ObjectId} [entry.entityId]
 * @param {Object} [entry.diff]    - { before, after } pre-computed, or null
 * @param {string} [entry.note]
 */
const record = (entry) => {
  const { req, action, entity, entityId, diff: providedDiff, note } = entry;
  const ctx = fromReq(req);

  const doc = {
    ...ctx,
    action,
    entity,
    entityId: entityId || null,
    diff: providedDiff || null,
    note: note || null,
  };

  // Intentionally not awaited. Errors logged, never rethrown.
  AuditLog.create(doc).catch((err) => {
    logger.error(
      { err: err.message, action, entity, entityId },
      'AuditLog write failed'
    );
  });
};

module.exports = { record, diff, stripSensitive, fromReq };
