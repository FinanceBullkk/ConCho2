const mongoose = require('mongoose');
const Evaluation = require('../../models/Evaluation');
const { ServiceError } = require('../../helpers/ServiceError');
const { enforceRowCap } = require('./export-row-cap');
const { generateEvaluationWorkbook } = require('./evaluation-workbook');

// ──────────────────────────────────────────────────────────
// Evaluation export (data pipeline + flow)
// ──────────────────────────────────────────────────────────
// Exports evaluations as Excel, joined with Class + User. Unlike attendance,
// evaluations are NOT marked as exported — they can be re-exported any number
// of times (snapshots, not events), so there is no claim/mark step.

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
    // DATA-009 (audit PR A): filter soft-deleted users at the join.
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

const exportEvaluations = async (opts = {}) => {
  const records = await queryEvaluationData(opts);

  if (records.length === 0) {
    throw new ServiceError('Không có bản ghi đánh giá nào để xuất (No evaluations found)', 404);
  }

  // PERF-001 (audit PR D): same hard cap as attendance export.
  enforceRowCap(records.length, 'evaluations');

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `TMS_Evaluations_${dateStr}_${records.length}records.xlsx`;

  // PERF-001: stream directly to response if res provided
  if (opts.res && typeof opts.res.pipe === 'function') {
    if (opts.beforeWrite) opts.beforeWrite({ filename, recordCount: records.length });
    await generateEvaluationWorkbook(records, opts.res);
    return { buffer: null, filename, recordCount: records.length };
  }

  const buffer = await generateEvaluationWorkbook(records);
  return { buffer, filename, recordCount: records.length };
};

module.exports = {
  buildEvaluationPipeline,
  queryEvaluationData,
  exportEvaluations,
};
