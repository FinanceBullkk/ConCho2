const AuditLog = require('../../models/AuditLog');

// audit-query-repository — MONGO impl (Phase 3 Wave-F).
// All Mongoose READ access for the audit log query API. The append-only write
// path lives in auditService.js (already ported, services/audit-repository.*);
// this isolates the read side so the Postgres twin (./audit-query-repository.pg)
// swaps only this file. Same interface as ./audit-query-repository.pg.

// Paginated, newest-first, actor-populated audit rows for a filter.
const findEntries = (filter, { skip, limit }) =>
  AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('actorId', 'empCode name role')
    .lean();

const countEntries = (filter) => AuditLog.countDocuments(filter);

// Full history for one entity (the "show me everything about X" support flow).
const findByEntity = (entity, entityId, limit = 500) =>
  AuditLog.find({ entity, entityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actorId', 'empCode name role')
    .lean();

module.exports = { findEntries, countEntries, findByEntity };
