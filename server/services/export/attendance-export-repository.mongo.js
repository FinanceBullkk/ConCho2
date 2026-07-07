const Attendance = require('../../models/Attendance');

// attendance-export-repository — MONGO impl (Phase 3 Wave-F PR-2).
// The Mongo aggregation pipelines moved here VERBATIM from attendance-export.js
// (they are the Mongo-specific execution detail); the orchestrator now calls
// SEMANTIC methods so the Postgres twin can own the same joins in SQL.
// Behaviour unchanged 1:1 — pipeline shape, soft-delete sub-pipeline guards
// (DATA-009), preserveNullAndEmptyArrays semantics, projection and sort.

/**
 * Build the aggregation pipeline to join Attendance with
 * User, Schedule, Class, and Team. (Moved verbatim from attendance-export.js.)
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

// ── Semantic methods (the interface the PG twin mirrors) ──

// The full 4-join export rows (Excel + JSON preview).
const findExportRows = (opts = {}) => Attendance.aggregate(buildExportPipeline(opts));

// The pre-claim id scan: PENDING records whose SCHEDULE date falls in range.
// (Deliberately only the schedule join — mirrors the pre-refactor idPipeline.)
const findPendingIdsInRange = async ({ from, to } = {}) => {
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
  const docs = await Attendance.aggregate(idPipeline);
  return docs.map((d) => d._id);
};

// Truly-exportable PENDING count: same joins as the export (drops orphans via
// $unwind) so the badge matches what an export would actually produce.
const countExportablePending = async () => {
  const countPipeline = buildExportPipeline({ includeExported: false })
    .filter((stage) => !stage.$project && !stage.$sort);
  countPipeline.push({ $count: 'total' });
  const [result] = await Attendance.aggregate(countPipeline);
  return result?.total || 0;
};

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

module.exports = {
  findExportRows,
  findPendingIdsInRange,
  countExportablePending,
  claimBatch,
  markExported,
  countByStatus,
  findLastExported,
  countExportedInWindow,
};
