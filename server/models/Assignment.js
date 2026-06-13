const mongoose = require('mongoose');

// Wave D4 v1: required training assignments with due dates.
const targetTypes = ['program', 'path'];
const statuses = ['active', 'archived'];

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true },
    description: { type: String, trim: true, default: '' },
    targetType: { type: String, enum: targetTypes, required: true },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningProgram',
      default: null,
    },
    pathId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningPath',
      default: null,
    },
    dueDate: { type: Date, required: [true, 'Due date is required'] },
    userIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    departmentIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      default: [],
    },
    status: { type: String, enum: statuses, default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Recertification (D6): set when this assignment was auto-created for an
    // expiring certificate. Drives idempotency — at most ONE recert assignment
    // ever per certificate (partial unique index below).
    sourceCertificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Certificate',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

assignmentSchema.pre('validate', function ensureSingleTarget(next) {
  if (this.targetType === 'program') {
    this.pathId = null;
    if (!this.programId) this.invalidate('programId', 'Program target is required');
  }
  if (this.targetType === 'path') {
    this.programId = null;
    if (!this.pathId) this.invalidate('pathId', 'Path target is required');
  }
  next();
});

assignmentSchema.index({ status: 1, dueDate: 1 });
assignmentSchema.index({ programId: 1, status: 1 });
assignmentSchema.index({ pathId: 1, status: 1 });
assignmentSchema.index({ userIds: 1 });
assignmentSchema.index({ departmentIds: 1 });
// One auto-recert assignment EVER per certificate (idempotency backstop). Only
// rows with a sourceCertificateId participate (null = a normal assignment).
assignmentSchema.index(
  { sourceCertificateId: 1 },
  { unique: true, partialFilterExpression: { sourceCertificateId: { $type: 'objectId' } } },
);

assignmentSchema.statics.enums = { targetTypes, statuses };

module.exports = mongoose.model('Assignment', assignmentSchema);
