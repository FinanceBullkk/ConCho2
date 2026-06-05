const mongoose = require('mongoose');

const RETENTION_DAYS = 180;

const notificationLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['assignment_due_soon', 'assignment_overdue', 'manager_assignment_digest'],
      required: true,
    },
    channel: { type: String, enum: ['email'], default: 'email', required: true },
    recipientEmail: { type: String, default: '' },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    learnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cadenceKey: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'sent', 'skipped', 'failed'],
      default: 'pending',
    },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

notificationLogSchema.index(
  {
    type: 1,
    channel: 1,
    recipientEmail: 1,
    recipientUserId: 1,
    assignmentId: 1,
    learnerId: 1,
    cadenceKey: 1,
  },
  { unique: true },
);

notificationLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 },
);

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
