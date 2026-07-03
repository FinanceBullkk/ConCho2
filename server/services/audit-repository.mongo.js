const AuditLog = require('../models/AuditLog');

// audit-repository — MONGO impl (Phase 3 Wave-E slice E1).
// The three DB touches of the audit write path, extracted verbatim from
// auditService/audit-chain so the Postgres twin swaps cleanly:
//   findChainHead   — newest chained row (queue head reload + verify bound)
//   insertChainedRow — the serialized hash-chain append (validation = schema)
//   findChainWindow  — verifyChain's [from,to] seq scan
// Ordering/hashing logic stays in auditService + audit-chain (backend-agnostic).

const findChainHead = async () => {
  const last = await AuditLog.findOne({ seq: { $exists: true } })
    .sort({ seq: -1 })
    .select('seq hash')
    .lean();
  return last ? { seq: last.seq, hash: last.hash } : null;
};

// Mongoose `create` validates required + enum (entity/actorRole) — the PG twin
// re-implements that from the same schema enumValues. Duplicate seq (chain
// fork) surfaces as E11000 from the partial-unique index.
const insertChainedRow = async (row) => {
  await AuditLog.create(row);
};

const findChainWindow = (fromSeq, toSeq) =>
  AuditLog.find({ seq: { $gte: fromSeq, $lte: toSeq } })
    .sort({ seq: 1 })
    .select('seq prevHash hash actorId actorRole actorEmpCode action entity entityId diff note')
    .lean();

module.exports = { findChainHead, insertChainedRow, findChainWindow };
