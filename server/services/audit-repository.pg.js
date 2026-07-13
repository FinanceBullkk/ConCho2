const crypto = require('crypto');
const { query } = require('../config/pg');
const { AUDIT_ENTITY_VALUES, AUDIT_ROLE_VALUES } = require('./audit-enums');

// audit-repository — POSTGRES impl (Phase 3 Wave-E slice E1, mig 029).
// Same interface as ./audit-repository.mongo.
//
// Fidelity notes the parity test pins:
//   • entity/actorRole are validated app-side against the shared audit-enums
//     module (no CHECK constraint — the enum is a growing ratchet). Invalid →
//     ValidationError, exactly what Mongoose create threw.
//   • seq is bigint → node-pg returns it as a string; normalized to Number so
//     the queue's seq+1 arithmetic and verifyChain's gap check are identical.
//   • duplicate seq (chain fork) → 23505 re-thrown Mongo-style {code:11000}
//     (established convention) so callers stay backend-agnostic.
//   • diff is jsonb: Dates serialize to ISO strings on write; audit-chain's
//     stableStringify normalizes Dates to ISO at hash time too, so write-time
//     and verify-time hashes agree on both backends.

const newId = () => crypto.randomBytes(12).toString('hex');

const asDup = (err) => {
  if (err && err.code === '23505') {
    const dup = new Error(`E11000 duplicate key (${err.constraint || 'unique'})`);
    dup.code = 11000;
    return dup;
  }
  return err;
};

const validationError = (msg) =>
  Object.assign(new Error(`AuditLog validation failed: ${msg}`), { name: 'ValidationError' });

// Single source of truth for the enums — the plain audit-enums module (D2e-1;
// was the Mongoose schema enumValues before the model decouple).
const ENTITY_ENUM = new Set(AUDIT_ENTITY_VALUES);
const ROLE_ENUM = new Set(AUDIT_ROLE_VALUES);

const findChainHead = async () => {
  const { rows } = await query(
    `SELECT seq, hash FROM audit_log WHERE seq IS NOT NULL ORDER BY seq DESC LIMIT 1`
  );
  return rows[0] ? { seq: Number(rows[0].seq), hash: rows[0].hash } : null;
};

const insertChainedRow = async (row) => {
  // Mirror Mongoose create-time validation (required + enum).
  if (!row.action) throw validationError('action is required');
  if (!row.entity || !ENTITY_ENUM.has(row.entity)) {
    throw validationError(`entity \`${row.entity}\` is not a valid enum value`);
  }
  if (!row.actorRole || !ROLE_ENUM.has(row.actorRole)) {
    throw validationError(`actorRole \`${row.actorRole}\` is not a valid enum value`);
  }

  try {
    await query(
      `INSERT INTO audit_log(
         id, actor_id, actor_role, actor_emp_code, action, entity, entity_id,
         diff, request_id, ip, user_agent, note, seq, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        newId(),
        row.actorId ? String(row.actorId) : null,
        row.actorRole,
        row.actorEmpCode || null,
        row.action,
        row.entity,
        row.entityId ? String(row.entityId) : null,
        row.diff == null ? null : JSON.stringify(row.diff),
        row.requestId || null,
        row.ip || null,
        row.userAgent || null,
        row.note || null,
        row.seq,
        row.prevHash,
        row.hash,
      ]
    );
  } catch (err) {
    throw asDup(err);
  }
};

const findChainWindow = async (fromSeq, toSeq) => {
  const { rows } = await query(
    `SELECT seq, prev_hash, hash, actor_id, actor_role, actor_emp_code,
            action, entity, entity_id, diff, note
       FROM audit_log
      WHERE seq >= $1 AND seq <= $2
      ORDER BY seq ASC`,
    [fromSeq, toSeq]
  );
  return rows.map((r) => ({
    seq: Number(r.seq),
    prevHash: r.prev_hash,
    hash: r.hash,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    actorEmpCode: r.actor_emp_code,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    diff: r.diff,
    note: r.note,
  }));
};

module.exports = { findChainHead, insertChainedRow, findChainWindow };
