const AuditLog = require('../models/AuditLog');
const logger = require('../lib/logger');
const { GENESIS_PREV_HASH, computeHash } = require('./audit-chain');

// ──────────────────────────────────────────────────────────
// Audit Service (Phase 1.1)
// ──────────────────────────────────────────────────────────
// Three design choices worth knowing:
//
// 1. Writes are FIRE-AND-FORGET from the CALLER's perspective (no await in
//    callers). Audit must never break the user's request. If the AuditLog
//    write fails, we log the error and move on.
//
// 2. The diff() helper redacts sensitive fields BEFORE we hand the
//    object off to Mongo. Defense-in-depth: even if the caller
//    forgets to strip a password, the audit row won't carry it.
//
// 3. Writes are SERIALIZED through an in-process append queue so the
//    tamper-evident hash chain (seq + prevHash + hash) stays consistent —
//    each row links to the one before it. Callers still don't await; the
//    queue does the ordering. Single-writer assumption: this app runs one
//    Node process (API + in-process cron), and the unique seq index is the
//    final guard if that ever changes. See services/audit-chain.js.
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

// ── Hash-chain append queue ────────────────────────────────────────────────
// `queue` is a promise chain: each append runs strictly after the previous one
// resolves, so seq + prevHash are derived from a stable head. `head` caches the
// current chain tip in memory; it's loaded lazily from the DB on first use so a
// process restart (or Jest's per-file module reset) re-syncs from persisted
// state rather than re-starting the chain.
let queue = Promise.resolve();
let headPromise = null;

const loadHead = async () => {
  const last = await AuditLog.findOne({ seq: { $exists: true } })
    .sort({ seq: -1 })
    .select('seq hash')
    .lean();
  return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS_PREV_HASH };
};

const appendChained = async (doc) => {
  if (!headPromise) headPromise = loadHead();
  const head = await headPromise;

  const seq = head.seq + 1;
  const prevHash = head.hash;
  const hash = computeHash({ ...doc, seq, prevHash });

  await AuditLog.create({ ...doc, seq, prevHash, hash });

  // Advance the cached head only after the write lands.
  headPromise = Promise.resolve({ seq, hash });
};

/**
 * Record an audit event. Fire-and-forget from the caller's view — never throws
 * into the caller. Internally enqueued so the hash chain is written in order.
 *
 * @param {Object} entry
 * @param {Object} entry.req       - Express request (for actor + correlation)
 * @param {string} entry.action    - 'created' | 'updated' | 'deleted' | ...
 * @param {string} entry.entity    - 'User' | 'Team' | 'Class' | ...
 * @param {string|ObjectId} [entry.entityId]
 * @param {Object} [entry.diff]    - { before, after } pre-computed, or null
 * @param {string} [entry.note]
 * @returns {Promise<void>} resolves when this entry's write settles (tests may
 *   await it; production callers ignore it). Never rejects.
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

  queue = queue.then(() => appendChained(doc)).catch((err) => {
    logger.error(
      { err: err.message, action, entity, entityId },
      'AuditLog chained write failed'
    );
    // Re-sync the head from the DB on the next append so one failed write
    // doesn't desync seq/prevHash for everything after it.
    headPromise = null;
  });

  return queue;
};

/**
 * Await all currently-queued audit writes. Returns the queue tail (which never
 * rejects). Used by tests that need the fire-and-forget chain to settle before
 * asserting; harmless in production.
 */
const flush = () => queue;

/**
 * Drop the cached chain head + reset the queue. The next append re-loads the
 * head from the DB. Intended for tests that clear AuditLog and need the chain
 * to restart from genesis; never call this on a live server.
 */
const __resetChainCache = () => {
  queue = Promise.resolve();
  headPromise = null;
};

module.exports = { record, flush, diff, stripSensitive, fromReq, __resetChainCache };
