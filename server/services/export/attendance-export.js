// node:crypto randomUUID — the `uuid` package was dropped in the deps-light
// round (bcb0468); see auth-tokens.js for the production-only failure mode.
const { randomUUID } = require('crypto');
const { ServiceError } = require('../../helpers/ServiceError');
const { enforceRowCap } = require('./export-row-cap');
const { generateAttendanceWorkbook } = require('./attendance-workbook');
const repository = require('./attendance-export-repository');

// ──────────────────────────────────────────────────────────
// Attendance export (claim-race flow + stats orchestration)
// ──────────────────────────────────────────────────────────
// Gathers not-yet-exported Attendance data (syncStatus: PENDING), joins with
// User/Schedule/Class/Team, generates an Excel file (attendance-workbook), then
// marks records EXPORTED so they aren't picked up again. The P2-08 race-condition
// fix claims records (PENDING → EXPORTING + batchId) before generating so two
// concurrent admins get disjoint record sets — no double-export.
//
// Wave-F PR-2: the Mongo aggregation pipelines moved into
// attendance-export-repository.mongo (execution detail); this file talks only to
// SEMANTIC repository methods (findExportRows / findPendingIdsInRange /
// countExportablePending / claim / mark / counts), so the flow runs unchanged on
// either backend (DB_BACKEND selector).

/**
 * Query attendance records for export (full User/Schedule/Class/Team join).
 *
 * @param {Object} opts  { from?, to?, includeExported?, batchId? }
 * @returns {Array} Flattened attendance records with all joins
 */
const queryExportData = async (opts = {}) => repository.findExportRows(opts);

/**
 * Full export flow: atomic claim → generate Excel → mark exported.
 *
 * P2-08 race-condition fix: instead of query-then-mark (two separate ops
 * that two concurrent admins can interleave), we now:
 *   1. Atomically stamp all matching PENDING records with a unique
 *      exportBatchId and status=EXPORTING in a single updateMany.
 *   2. Query only the records we just claimed (by batchId).
 *   3. Generate the Excel from those records.
 *   4. Mark claimed records EXPORTED.
 *
 * If two admins export at the same moment, each gets a different batchId
 * and a disjoint set of records — no double-export.
 *
 * @param {Object} opts  { from?, to?, includeExported?, res?, beforeWrite? }
 * @returns {Object} { buffer, filename, recordCount, markedCount }
 */
const exportAttendance = async (opts = {}) => {
  if (opts.includeExported) {
    // Re-export path: no claiming needed — just query and generate.
    const records = await queryExportData(opts);
    if (records.length === 0) {
      throw new ServiceError('No records found', 404);
    }
    enforceRowCap(records.length, 'attendance');
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `TMS_Attendance_${dateStr}_${records.length}records.xlsx`;
    // PERF-001: stream if res provided
    if (opts.res && typeof opts.res.pipe === 'function') {
      if (opts.beforeWrite) opts.beforeWrite({ filename, recordCount: records.length, markedCount: 0 });
      await generateAttendanceWorkbook(records, opts.res);
      return { buffer: null, filename, recordCount: records.length, markedCount: 0 };
    }
    const buffer = await generateAttendanceWorkbook(records);
    return { buffer, filename, recordCount: records.length, markedCount: 0 };
  }

  // 1. Find IDs of PENDING records that fall within the requested date range
  //    (by schedule.startTime — the lesson date, P2-07). We do this BEFORE
  //    claiming so we only claim what will actually appear in the file —
  //    records outside the range are never touched (P2-08R fix).
  const { from, to } = opts;
  const idsToExport = await repository.findPendingIdsInRange({ from, to });

  if (idsToExport.length === 0) {
    throw new ServiceError('No pending records found', 404);
  }

  // PERF-001 (audit PR D): refuse oversized exports BEFORE claiming
  // records. Claiming + then failing inside generateExcel would leave
  // records stuck in EXPORTING — operator would need manual cleanup.
  enforceRowCap(idsToExport.length, 'attendance');

  // 2. Atomically claim only those specific IDs (PENDING → EXPORTING + batchId).
  //    The claim re-checks syncStatus=PENDING so we only claim records that are
  //    still PENDING even if a concurrent export ran between step 1 and 2.
  const batchId = randomUUID();
  const claimedResult = await repository.claimBatch(idsToExport, batchId);

  // P2R-01: A concurrent export may have claimed all matching records between
  // our ID scan (step 1) and this updateMany (step 2). If modifiedCount === 0
  // we won zero records — returning an empty Excel and 200 would be misleading.
  // Throw 404 so the caller knows there is nothing to export right now.
  if (claimedResult.modifiedCount === 0) {
    throw new ServiceError(
      'No records claimed — concurrent export may have taken them',
      404,
    );
  }

  // 3. Query our claimed records with full pipeline joins for Excel generation.
  const records = await queryExportData({ ...opts, batchId });

  // 4. Generate Excel (PERF-001: stream if res provided)
  //    All response headers MUST be set before workbook.xlsx.write(res)
  //    because Express flushes headers on the first write().
  const now2 = new Date();
  const dateStr2 = now2.toISOString().slice(0, 10).replace(/-/g, '');
  const filename2 = `TMS_Attendance_${dateStr2}_${records.length}records.xlsx`;

  let buffer;
  if (opts.res && typeof opts.res.pipe === 'function') {
    // Call the beforeWrite callback so the controller can set all headers
    // before the stream starts writing data.
    if (opts.beforeWrite) {
      opts.beforeWrite({
        filename: filename2,
        recordCount: records.length,
        markedCount: claimedResult.modifiedCount,
      });
    }
    await generateAttendanceWorkbook(records, opts.res);
    buffer = null;
  } else {
    buffer = await generateAttendanceWorkbook(records);
  }

  // 5. Mark only our claimed records as EXPORTED.
  //    Because we claimed exactly the records we'll export, every claimed
  //    record appears in the file — no silent "marked but not included" records.
  const markedResult = await repository.markExported(batchId);

  return { buffer, filename: filename2, recordCount: records.length, markedCount: markedResult.modifiedCount };
};

/**
 * Get export summary stats (how many PENDING vs EXPORTED).
 *
 * WHY the joined count instead of countDocuments? A plain
 * countByStatus('PENDING') counts ALL pending records, including orphans
 * (attendance for deleted schedules/users). countExportablePending applies the
 * same joins as the export, so the count matches what the actual export would
 * produce. No more "3 pending but 0 exportable".
 */
const getExportStats = async () => {
  const pending = await repository.countExportablePending();
  const exported = await repository.countByStatus('EXPORTED');

  // Phase 4 Surface 8 — "Last export" KPI: most recent exportedAt + how
  // many records share that batch (records updated together get the same
  // timestamp). Bucket within ±1s to tolerate per-row timestamp jitter.
  let lastExportAt = null;
  let lastExportCount = 0;
  const lastDoc = await repository.findLastExported();
  if (lastDoc?.exportedAt) {
    lastExportAt = lastDoc.exportedAt;
    const windowStart = new Date(lastExportAt.getTime() - 1000);
    const windowEnd   = new Date(lastExportAt.getTime() + 1000);
    lastExportCount = await repository.countExportedInWindow(windowStart, windowEnd);
  }

  return {
    pending,
    exported,
    total: pending + exported,
    lastExportAt,
    lastExportCount,
  };
};

module.exports = {
  queryExportData,
  exportAttendance,
  getExportStats,
};
