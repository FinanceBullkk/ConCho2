const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Attendance = require('../models/Attendance');
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
const buildExportPipeline = ({ from, to, includeExported = false }) => {
  // ── Stage 1: Filter ─────────────────────────────────────
  const matchStage = {};
  if (!includeExported) {
    matchStage.syncStatus = 'PENDING';
  }
  if (from || to) {
    matchStage.createdAt = {};
    if (from) matchStage.createdAt.$gte = new Date(from);
    if (to) matchStage.createdAt.$lte = new Date(to);
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

    sheet.addRow({
      empCode: r.empCode,
      userName: r.userName,
      department: r.department || '',
      userRole: r.userRole,
      classCode: r.classCode,
      courseName: r.courseName,
      teamName: r.teamName,
      dateStr: toVN(startDate).format('DD/MM/YYYY'),
      startStr: toVN(startDate).format('HH:mm'),
      endStr: toVN(endDate).format('HH:mm'),
      duration: Math.round(r.durationMinutes),
      statusText: STATUS_TEXT[r.status] || r.status,
      status: r.status,
      remark: r.remark || '',
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
 * Full export flow: query → generate Excel → mark exported.
 *
 * @param {Object} opts  { from?, to?, includeExported? }
 * @returns {Object} { buffer, filename, recordCount, markedCount }
 */
const exportAttendance = async (opts = {}) => {
  // 1. Query data
  const records = await queryExportData(opts);

  if (records.length === 0) {
    throw new ServiceError('Không có bản ghi nào để xuất (No pending records found)', 404);
  }

  // 2. Generate Excel
  const buffer = await generateExcel(records);

  // 3. Mark as exported (only for PENDING records, skip if includeExported)
  let markedCount = 0;
  if (!opts.includeExported) {
    const pendingIds = records.map(r => r._id);
    const result = await markAsExported(pendingIds);
    markedCount = result.modifiedCount;
  }

  // 4. Build filename
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `TMS_Attendance_${dateStr}_${records.length}records.xlsx`;

  return { buffer, filename, recordCount: records.length, markedCount };
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

  return { pending, exported, total: pending + exported };
};

module.exports = {
  ServiceError,
  exportAttendance,
  getExportStats,
  queryExportData,
};
