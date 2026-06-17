const Attendance = require('../../models/Attendance');

// attendance-export-repository — Mongoose execution for the attendance export.
// The pipeline SHAPE + the claim-race ORCHESTRATION stay in attendance-export.js;
// this file isolates the raw model calls (aggregate / claim / mark / counts) so
// the Postgres port swaps only this file (Phase 0 readiness). Behaviour unchanged.

const aggregate = (pipeline) => Attendance.aggregate(pipeline);

// P2-08 atomic claim: stamp the given PENDING ids with EXPORTING + a batch id so
// concurrent exporters get disjoint record sets. Returns the updateMany result.
const claimBatch = (ids, batchId) =>
  Attendance.updateMany(
    { _id: { $in: ids }, syncStatus: 'PENDING' },
    { $set: { syncStatus: 'EXPORTING', exportBatchId: batchId } },
  );

// Mark a claimed batch EXPORTED. Returns the updateMany result.
const markExported = (batchId) =>
  Attendance.updateMany(
    { exportBatchId: batchId },
    { $set: { syncStatus: 'EXPORTED', exportedAt: new Date() } },
  );

const countByStatus = (status) => Attendance.countDocuments({ syncStatus: status });

// Most recent exported row (for the "last export" KPI).
const findLastExported = () =>
  Attendance.findOne({ syncStatus: 'EXPORTED', exportedAt: { $ne: null } })
    .select('exportedAt')
    .sort({ exportedAt: -1 })
    .lean();

const countExportedInWindow = (start, end) =>
  Attendance.countDocuments({ syncStatus: 'EXPORTED', exportedAt: { $gte: start, $lte: end } });

module.exports = { aggregate, claimBatch, markExported, countByStatus, findLastExported, countExportedInWindow };
