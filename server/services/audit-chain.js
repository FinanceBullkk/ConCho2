const crypto = require('crypto');
const auditRepository = require('./audit-repository');

// ──────────────────────────────────────────────────────────
// Audit hash chain — content hashing + verification
// (Investment Build Plan #3a — "tamper-evident hash chain")
// ──────────────────────────────────────────────────────────
// Each AuditLog row carries seq + prevHash + hash. `hash` is the
// sha256 of the row's immutable content PLUS the prior row's hash, so
// the rows form a chain: altering any field, reordering, or deleting a
// row breaks the chain and is detectable by re-deriving it.
//
// This module is pure given its inputs — the write-ordering (serializing
// appends so seq + prevHash stay consistent) lives in auditService.
// ──────────────────────────────────────────────────────────

// Fixed seed for the first row (row 1's prevHash). 64 zeros = sha256 width.
const GENESIS_PREV_HASH = '0'.repeat(64);

// Retention window, mirrored from the AuditLog TTL. Informational only — see
// the monotonic-expiry note in verifyChain for why we don't need it to avoid
// TTL false-positives.
const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 730);

// Verify never scans more than this many rows in one call — an admin-triggered
// re-hash over a bounded window, not an unbounded table walk.
const MAX_WINDOW = 5000;

/**
 * Deterministic JSON: sorts object keys recursively so the SAME logical content
 * always serializes to the SAME string — at write time and again at verify
 * time — regardless of how Mongo happens to return embedded-document key order.
 * Without this, a re-read `diff` object could stringify differently and produce
 * a false tamper alarm.
 */
const stableStringify = (value) => {
  if (value === null || value === undefined) return JSON.stringify(null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
};

/**
 * The immutable content bound into a row's hash. Deliberately the WHO / WHAT /
 * diff / note + the backlink — per the contract sha256(seq + actor + action +
 * entity + diff + prevHash). Volatile request context (requestId / ip /
 * userAgent) is intentionally NOT bound: it isn't the auditable fact and would
 * only add re-derivation fragility.
 */
const canonicalPayload = (row) => stableStringify({
  seq: row.seq,
  actorId: row.actorId ? String(row.actorId) : null,
  actorRole: row.actorRole || null,
  actorEmpCode: row.actorEmpCode || null,
  action: row.action,
  entity: row.entity,
  entityId: row.entityId ? String(row.entityId) : null,
  diff: row.diff ?? null,
  note: row.note ?? null,
  prevHash: row.prevHash,
});

/** sha256 of a row's canonical content. Same inputs → same hash, always. */
const computeHash = (row) =>
  crypto.createHash('sha256').update(canonicalPayload(row)).digest('hex');

/**
 * Re-derive the hash chain over a [from, to] seq window and report the first
 * inconsistency.
 *
 * Two independent checks per row:
 *   (a) self-hash — recompute the row's hash from its stored fields; a mismatch
 *       means a field was altered after the fact.
 *   (b) backlink — a row's prevHash must equal the prior row's hash; a mismatch
 *       (or a seq gap mid-window) means rows were reordered or deleted.
 *
 * TTL reconciliation: seq order == createdAt order == TTL-expiry order, so the
 * TTL only ever truncates the OLDEST prefix of the chain — it never removes a
 * middle row. Therefore the only legitimately-unverifiable backlink is the
 * window's FIRST surviving row (its predecessor may have expired); we skip that
 * one link. Any gap AFTER the first row is necessarily a deletion, not expiry.
 *
 * @param {{ from?: number|string, to?: number|string, repo?: Object }} [opts]
 *   `repo` defaults to the DB_BACKEND-selected audit repository; the pg-parity
 *   test passes each impl explicitly to verify the chain on both backends.
 * @returns {Promise<{ ok:boolean, checked:number, from:number|null,
 *   to:number|null, firstBrokenSeq:number|null, reason:string }>}
 */
const verifyChain = async ({ from, to, repo = auditRepository } = {}) => {
  const head = await repo.findChainHead();

  if (!head) {
    return { ok: true, checked: 0, from: null, to: null, firstBrokenSeq: null, reason: 'empty-chain' };
  }

  const toNum = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  let toSeq = toNum(to);
  toSeq = toSeq === null ? head.seq : Math.min(toSeq, head.seq);

  let fromSeq = toNum(from);
  if (fromSeq === null || fromSeq < 1) fromSeq = Math.max(1, toSeq - MAX_WINDOW + 1);
  // Clamp window to MAX_WINDOW even when an explicit, oversized range is given.
  if (toSeq - fromSeq + 1 > MAX_WINDOW) fromSeq = toSeq - MAX_WINDOW + 1;

  const rows = await repo.findChainWindow(fromSeq, toSeq);

  const broken = (seq, reason) => ({
    ok: false, checked: rows.length, from: fromSeq, to: toSeq, firstBrokenSeq: seq, reason,
  });

  let prev = null;
  for (const row of rows) {
    if (computeHash(row) !== row.hash) return broken(row.seq, 'hash-mismatch');
    if (prev) {
      if (row.seq !== prev.seq + 1) return broken(row.seq, 'missing-rows');
      if (row.prevHash !== prev.hash) return broken(row.seq, 'broken-link');
    }
    prev = row;
  }

  return { ok: true, checked: rows.length, from: fromSeq, to: toSeq, firstBrokenSeq: null, reason: 'verified' };
};

module.exports = {
  GENESIS_PREV_HASH,
  RETENTION_DAYS,
  MAX_WINDOW,
  stableStringify,
  computeHash,
  verifyChain,
};
