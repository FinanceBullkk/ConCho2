const mongoose = require('mongoose');

const RETENTION_DAYS = 180;

const notificationLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['assignment_due_soon', 'assignment_overdue', 'manager_assignment_digest',
        // Certificate recertification signal — emailed + shown in the bell when
        // an Issued certificate nears its validUntil. cadenceKey is
        // `<certificateNumber>:expiry_<30|7>` (one notice per cert per bucket).
        'certificate_expiring',
        // Wave E3 phase-04 slice B — a freed seat auto-enrolled a waiter.
        // cadenceKey is `<scheduleId>:<userId>` (one notice per promotion).
        'waitlist_promoted',
        // Cohesion P5 follow-up — in-app-only events (no email). cadenceKey:
        //  - certificate_issued  → certificateNumber (one per issued certificate)
        //  - cohort_enrolled     → enrollmentId (admin direct-enrolled a learner)
        //  - booking_confirmed   → `<scheduleId>:<userId>` (leader booked a slot)
        //  - session_enrolled    → `<scheduleId>:<userId>` (auto-added to a session
        //                          roster by someone else's booking — team member
        //                          on a leader booking / cohort enrollee on an
        //                          admin-scheduled session; the booker is skipped)
        'certificate_issued', 'cohort_enrolled', 'booking_confirmed', 'session_enrolled'],
      required: true,
    },
    // 'in_app' rows have no email — they exist purely for the notification bell.
    channel: { type: String, enum: ['email', 'in_app'], default: 'email', required: true },
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
    // In-app read state (Cohesion P5). null = unread in the notification bell.
    // Independent of `status` (the email-delivery state) — the same log row is
    // both the email record and the in-app feed item.
    readAt: { type: Date, default: null },
    error: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

// Bell query: a user's own notifications, newest first (Cohesion P5).
notificationLogSchema.index({ recipientUserId: 1, createdAt: -1 });

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
