// node:crypto randomUUID — the `uuid` package was dropped in the deps-light
// round (bcb0468); see auth-tokens.js for the production-only failure mode.
const { randomUUID } = require('crypto');
const Attendance = require('../../models/Attendance');
const { ServiceError } = require('../../helpers/ServiceError');
const { enforceRowCap } = require('./export-row-cap');
const { generateAttendanceWorkbook } = require('./attendance-workbook');

// ──────────────────────────────────────────────────────────
// Attendance export (data pipeline + claim-race flow + stats)
// ──────────────────────────────────────────────────────────
// Gathers not-yet-exported Attendance data (syncStatus: PENDING), joins with
// User/Schedule/Class/Team, generates an Excel file (attendance-workbook), then
// marks records EXPORTED so they aren't picked up again. The P2-08 race-condition fix claims
// records (PENDING → EXPORTING + batchId) before generating so two concurrent
// admins get disjoint record sets — no double-export.

/**
 * Build the aggregation pipeline to join Attendance with
 * User, Schedule, Class, and Team.
 *
 * @param {Object} opts
 * @param {Date}   opts.from          Start date filter
 * @param {Date}   opts.to            End date filter
 * @param {boolean} opts.includeExported  If true, include EXPORTED records
 * @param {string} opts.batchId       If set, select only this claimed batch
 * @returns {Array} MongoDB aggregation pipeline
 */
const buildExportPipeline = ({ from, to, includeExported = false, batchId } = {}) => {
  // ── Stage 1: Filter by syncStatus / batchId ─────────────
  // Date range is applied AFTER the schedule $lookup (Stage 2b) so we
  // filter by the actual lesson date (schedule.startTime) rather than
  // Attendance.createdAt — which is the DB write time and may differ
  // from the session date by hours or days (P2-07 fix).
  const matchStage = {};
  if (batchId) {
    // Claimed export: select only our batch (P2-08).
    matchStage.exportBatchId = batchId;
  } else if (!includeExported) {
    matchStage.syncStatus = 'PENDING';
  }

  const pipeline = [];
  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
  }

  // ── Stage 2: Join Schedule ──────────────────────────────
  pipeline.push(
    { $lookup: { from: 'schedules', localField: 'scheduleId', foreignField: '_id', as: 'schedule' } },
    { $unwind: '$schedule' }
  );

  // ── Stage 2b: Filter by lesson date (schedule.startTime) ─
  if (from || to) {
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);
    pipeline.push({ $match: { 'schedule.startTime': dateFilter } });
  }

  // ── Stage 3: Join User (employee) ─────────────────────
  // DATA-009 (audit PR A): use the pipeline form of $lookup so we can
  // $match isDeleted at the join. Mongoose pre('find')/pre('aggregate')
  // hooks do NOT fire inside $lookup sub-pipelines, so without this
  // explicit filter soft-deleted users would appear in exports.
  pipeline.push(
    {
      $lookup: {
        from: 'users',
        let: { uid: '$userId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$uid'] }, isDeleted: { $ne: true } } },
        ],
        as: 'user',
      },
    },
    { $unwind: '$user' }
  );

  // ── Stage 4: Join Class ─────────────────────────────────
  // Pipeline form + isDeleted guard: $lookup sub-pipelines don't fire the
  // Mongoose soft-delete hooks, so a simple lookup would leak soft-deleted class
  // labels (DATA-009 parity with the user join above). preserveNullAndEmptyArrays
  // so a soft-deleted/missing class never DROPS a real attendance HR record —
  // the row stays, just without a stale class label.
  pipeline.push(
    {
      $lookup: {
        from: 'classes',
        let: { cid: '$schedule.classId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$cid'] }, isDeleted: { $ne: true } } }],
        as: 'class',
      },
    },
    { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } }
  );

  // ── Stage 5: Join Team ──────────────────────────────────
  pipeline.push(
    {
      $lookup: {
        from: 'teams',
        let: { tid: '$schedule.bookedTeamId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$tid'] }, isDeleted: { $ne: true } } }],
        as: 'team',
      },
    },
    { $unwind: { path: '$team', preserveNullAndEmptyArrays: true } }
  );

  // ── Stage 6: Projection ────────────────────────────────
  pipeline.push({
    $project: {
      _id: 1,
      empCode: '$user.empCode',
      userName: '$user.name',
      department: '$user.department',
      userRole: '$user.role',
      classCode: '$class.classCode',
      courseName: '$class.courseName',
      teamName: { $ifNull: ['$team.name', 'N/A'] },
      startTime: '$schedule.startTime',
      endTime: '$schedule.endTime',
      durationMinutes: {
        $divide: [{ $subtract: ['$schedule.endTime', '$schedule.startTime'] }, 60000],
      },
      roomLink: { $ifNull: ['$schedule.roomLink', ''] },
      status: '$status',
      remark: '$remark',
      attendanceDate: '$createdAt',
      syncStatus: '$syncStatus',
      exportedAt: '$exportedAt',
    },
  });

  pipeline.push({ $sort: { startTime: 1, empCode: 1 } });

  return pipeline;
};

/**
 * Query pending attendance records for export.
 *
 * @param {Object} opts  { from?, to?, includeExported?, batchId? }
 * @returns {Array} Flattened attendance records with all joins
 */
const queryExportData = async (opts = {}) => {
  const pipeline = buildExportPipeline(opts);
  return Attendance.aggregate(pipeline);
};

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

  // 1. Find IDs of PENDING records that fall within the requested date range.
  //    We do this BEFORE claiming so we only claim what will actually appear
  //    in the file — records outside the range are never touched (P2-08R fix).
  const { from, to } = opts;
  const idPipeline = [
    { $match: { syncStatus: 'PENDING' } },
    { $lookup: { from: 'schedules', localField: 'scheduleId', foreignField: '_id', as: 'schedule' } },
    { $unwind: '$schedule' },
  ];
  if (from || to) {
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);
    idPipeline.push({ $match: { 'schedule.startTime': dateFilter } });
  }
  idPipeline.push({ $project: { _id: 1 } });

  const matchingDocs = await Attendance.aggregate(idPipeline);
  const idsToExport = matchingDocs.map(d => d._id);

  if (idsToExport.length === 0) {
    throw new ServiceError('No pending records found', 404);
  }

  // PERF-001 (audit PR D): refuse oversized exports BEFORE claiming
  // records. Claiming + then failing inside generateExcel would leave
  // records stuck in EXPORTING — operator would need manual cleanup.
  enforceRowCap(idsToExport.length, 'attendance');

  // 2. Atomically claim only those specific IDs (PENDING → EXPORTING + batchId).
  //    Using { _id: $in } + { syncStatus: PENDING } ensures we only claim records
  //    that are still PENDING even if a concurrent export ran between step 1 and 2.
  const batchId = randomUUID();
  const claimedResult = await Attendance.updateMany(
    { _id: { $in: idsToExport }, syncStatus: 'PENDING' },
    { $set: { syncStatus: 'EXPORTING', exportBatchId: batchId } }
  );

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
  const markedResult = await Attendance.updateMany(
    { exportBatchId: batchId },
    { $set: { syncStatus: 'EXPORTED', exportedAt: new Date() } }
  );

  return { buffer, filename: filename2, recordCount: records.length, markedCount: markedResult.modifiedCount };
};

/**
 * Get export summary stats (how many PENDING vs EXPORTED).
 *
 * WHY use the pipeline instead of countDocuments?
 * countDocuments({ syncStatus: 'PENDING' }) counts ALL pending records,
 * including orphans (attendance for deleted schedules/users).
 * The pipeline drops orphans via $unwind, so the count matches
 * what the actual export would produce. No more "3 pending but 0 exportable".
 */
const getExportStats = async () => {
  // Count truly exportable PENDING records (same joins as export)
  const pendingPipeline = buildExportPipeline({ includeExported: false });
  // Replace projection + sort with a simple count
  // Remove $project and $sort stages, add $count
  const countPipeline = pendingPipeline.filter(
    stage => !stage.$project && !stage.$sort
  );
  countPipeline.push({ $count: 'total' });

  const [pendingResult] = await Attendance.aggregate(countPipeline);
  const pending = pendingResult?.total || 0;

  const exported = await Attendance.countDocuments({ syncStatus: 'EXPORTED' });

  // Phase 4 Surface 8 — "Last export" KPI: most recent exportedAt + how
  // many records share that batch (records updated together get the same
  // timestamp). Bucket within ±1s to tolerate per-row timestamp jitter.
  let lastExportAt = null;
  let lastExportCount = 0;
  const lastDoc = await Attendance
    .findOne({ syncStatus: 'EXPORTED', exportedAt: { $ne: null } })
    .select('exportedAt')
    .sort({ exportedAt: -1 })
    .lean();
  if (lastDoc?.exportedAt) {
    lastExportAt = lastDoc.exportedAt;
    const windowStart = new Date(lastExportAt.getTime() - 1000);
    const windowEnd   = new Date(lastExportAt.getTime() + 1000);
    lastExportCount = await Attendance.countDocuments({
      syncStatus: 'EXPORTED',
      exportedAt: { $gte: windowStart, $lte: windowEnd },
    });
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
  buildExportPipeline,
  queryExportData,
  exportAttendance,
  getExportStats,
};
