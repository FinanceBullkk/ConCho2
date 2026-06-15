const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// User Model
// ──────────────────────────────────────────────────────────
// Roles: Admin, Teacher, Participant
// A "Team Leader" is simply a Participant referenced in Team.leaderId
//
// CRITICAL MIDDLEWARE:
//   Auto-Release Slot — when status changes to 'Dropped',
//   all future Schedule enrollments for this user are atomically
//   removed via $pull + $inc.
// ──────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    empCode: {
      type: String,
      unique: true,        // Creates a unique B-tree index → O(log n) lookups
      trim: true,
      uppercase: true,     // Normalize at write time → exact-match queries work
      // Auto-generated as 6-digit number (e.g. 000001) via Counter helper
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    // Workspace email — admin enters per-user (no derivable pattern).
    // Required for Google Calendar invitations. Optional at schema level
    // so existing rows without email don't break; controllers enforce
    // required-on-create via Zod.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      validate: {
        validator: (v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: (props) => `${props.value} is not a valid email`,
      },
    },
    role: {
      type: String,
      enum: {
        // Coordinator (re-center Phase 1) = training-ops management bundle
        // via policy/capabilities.js — NOT a full Admin (no user/security).
        values: ['Admin', 'Coordinator', 'Teacher', 'Participant'],
        message: '{VALUE} is not a valid role',
      },
      required: [true, 'Role is required'],
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    // ── Org model (Wave D3) ─────────────────────────────────
    // Structured org hierarchy, added alongside the legacy free-text
    // `department` string (non-destructive — "open until populated"). Both
    // nullable; later fed by Google Directory sync (Wave D2). `managerId`
    // makes the reporting tree queryable (manager dashboard scopes on it);
    // `departmentId` points at the Department entity (replaces the string
    // over time without a destructive rename).
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    // Office (physical site) the employee belongs to — re-center Phase 1.
    // Same "open until populated" pattern as departmentId; manually set via
    // org assignment until Directory sync (Wave D2) fills it.
    officeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      default: null,
    },
    // Admin-defined custom fields (CustomFieldDefinition entity='User'), keyed
    // by the definition's `key`. Same value-map pattern as LearningProgram.
    customFields: {
      type: Object,
      default: {},
    },
    position: {
      type: String,
      trim: true,
      default: '',
    },
    // Per-user notification delivery preferences (TMS.update S7). Free-form by
    // design: { categories: { <cat>: { inApp, email } }, digest }. Validated by
    // the notification domain's zod schema on write; merged over server defaults
    // on read. Default undefined = "use server defaults".
    notificationPreferences: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    status: {
      type: String,
      enum: {
        values: ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'],
        message: '{VALUE} is not a valid status',
      },
      default: 'Active',
    },
    dropReason: {
      type: String,
      trim: true,
      default: '',
    },
    entranceLevel: {
      type: String,
      trim: true,
      default: '',
    },
    currentLevel: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [10, 'Password must be at least 10 characters'],
      select: false, // Never return password by default
    },

    // Set on every password change so tokens issued before this date are rejected.
    passwordChangedAt: {
      type: Date,
      default: null,
      select: false, // Internal field — not exposed to clients
    },

    // ── Force password change (SEC-04) ──────────────────────
    // Set to true by seed / admin tooling for accounts that use a default
    // password (e.g. the seed Admin). The frontend intercepts this flag
    // and blocks ALL navigation until the user changes their password.
    // Cleared automatically on a successful PUT /auth/change-password.
    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    // ── Password reset (forgot-password flow) ───────────────
    // Raw token is emailed to the user; only the SHA-256 hash is stored
    // here so a DB breach cannot be used to reset accounts.
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },

    // ── MFA / TOTP (Phase 1.3) ──────────────────────────────
    // mfaSecret stores the base32-encoded shared secret used to verify
    // TOTP codes. Kept select:false so it never leaks via /me, list
    // endpoints, or the generic admin-db explorer.
    //
    // mfaBackupCodes: array of bcrypt hashes. Each is single-use:
    // matching one removes it from the array. 8 codes generated at
    // setup, shown to the user once (never again).
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecret: {
      type: String,
      default: null,
      select: false,
    },
    // Temporary secret during MFA enrollment — only copied to mfaSecret
    // after the user proves possession via verify-setup (F5 audit fix).
    // Expires after 15 minutes; cleared on successful or abandoned setup.
    mfaPendingSecret: {
      type: String,
      default: null,
      select: false,
    },
    mfaPendingSecretExpires: {
      type: Date,
      default: null,
      select: false,
    },
    mfaBackupCodes: {
      type: [String],
      default: [],
      select: false,
    },
    // Replay-attack protection: stores the ABSOLUTE TOTP step counter
    // (floor(now/30) + verifyDelta offset) of the last successful login.
    // Any code from that step or earlier (counter ≤ this value) is rejected;
    // a later step still logs in. SEC-018 (audit round 3): this was previously
    // the RELATIVE delta (always 0 for a current code), which falsely locked a
    // user out of TOTP after their first login. Null = no TOTP login yet.
    mfaLastUsedCounter: {
      type: Number,
      default: null,
      select: false,
    },

    // ── Brute-force defense (Phase 0.4) ─────────────────────
    // Counts consecutive failed login attempts. Reset to 0 on success
    // or after lockUntil expires. Rate-limit middleware is the first
    // line of defense; this DB-backed lockout is durable across
    // multi-instance deploys where an in-memory limiter is per-process.
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },

    // ── Soft-delete fields (UX-03) ──────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
      select: false, // Hidden from normal queries
    },
    deletedAt: {
      type: Date,
      default: null,
      select: false,
    },
    // Audit PR Q (DATA-008): on soft-delete the live `empCode` is mutated
    // to `<original>__DEL_<timestamp36>` so the original slot can be
    // reused by a new hire. The email partial unique excludes nulls, so
    // we move the original email here and null out the live field at the
    // same time. Restore reverses both moves (or 409s if the original
    // empCode / email is already taken by a replacement).
    _softDeletedEmail: {
      type: String,
      default: null,
      select: false,
    },

    // ── Last-active write-through cache (audit PR H / PERF-008) ─
    // Stored on the user document so getUsers doesn't have to run a
    // Schedule×Attendance aggregation per page render. Updated from
    // attendanceService.bulkMark when a P/L (present/late) is recorded
    // — the only statuses that count as "active" in the dashboard.
    //
    // Schema is denormalised: source of truth is still
    // max(Attendance{status:'P'|'L'} → Schedule.startTime). The
    // reconciler can re-derive it if drift is suspected; getUsers
    // simply reads this field as an O(1) projection.
    lastActiveAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Soft-delete auto-filter (UX-03) ─────────────────────
// Automatically exclude soft-deleted users from all queries
// unless the caller explicitly sets { isDeleted: true } in
// the filter (e.g. for admin "trash" view).
// 'distinct' added in audit round 2 (DATA-012): it is query middleware too,
// and dashboard filter-options was leaking trashed users' values through it.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'findOneAndDelete', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  userSchema.pre(hook, function () {
    const filter = this.getFilter();
    // Only auto-add if caller hasn't explicitly queried isDeleted
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
}

// Soft-delete filter for aggregate() pipelines (Architecture smell D fix).
// Injects { isDeleted: { $ne: true } } at the front of the pipeline unless
// any existing $match stage already references isDeleted (explicit override).
userSchema.pre('aggregate', function () {
  const hasExplicitFilter = this.pipeline().some(
    (stage) => stage.$match && stage.$match.isDeleted !== undefined,
  );
  if (!hasExplicitFilter) {
    this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
  }
});

// ── Indexes ───────────────────────────────────────────────
userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });
// Org hierarchy lookups (manager dashboard scopes reports by managerId).
userSchema.index({ managerId: 1 });
userSchema.index({ departmentId: 1 });
userSchema.index({ officeId: 1 });
// Partial unique on email: enforce no duplicates among users that HAVE
// an email (string-typed). A plain `sparse:true` is not enough here
// because the field has `default: null` and MongoDB treats null values
// as collisions; partialFilterExpression is the correct primitive.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);

// ── Pre-save: hash password ───────────────────────────────
// NOTE: empCode generation has been moved to the controller
// using the atomic Counter helper (helpers/counter.js).
// This eliminates the race condition that existed when two
// concurrent requests both queried the max empCode before
// either had saved.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);

  // DATA-014 (audit PR A): bump passwordChangedAt automatically whenever
  // the password changes. The middleware/auth.js JTI check (auth.js:138-146)
  // rejects tokens whose iat is earlier than passwordChangedAt — without
  // this auto-bump, any code path that mutates `password` without explicitly
  // setting the timestamp (e.g. an admin DB tool, a future migration, the
  // reset-password handler which already does it but isn't enforced) would
  // leave old tokens valid.
  //
  // Subtract 1s as a clock-skew guard so a token issued in the SAME second
  // as the change is still invalidated (iat is in seconds; otherwise floor
  // rounding could produce a token with iat === changedAt).
  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

// ── Instance method: compare password ─────────────────────
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ──────────────────────────────────────────────────────────
// AUTO-RELEASE SLOT MIDDLEWARE
// ──────────────────────────────────────────────────────────
// Triggered on findOneAndUpdate (admin status change).
// 1. pre: snapshot the old status
// 2. post: if status changed TO 'Dropped', pull user from
//    all future schedules.
// ──────────────────────────────────────────────────────────

userSchema.pre('findOneAndUpdate', async function (next) {
  // Store the document's current state before the update
  const docToUpdate = await this.model.findOne(this.getQuery()).lean();
  if (docToUpdate) {
    this._previousStatus = docToUpdate.status;
    this._userId = docToUpdate._id;
  }
  next();
});

userSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc) return;

  const previousStatus = this._previousStatus;
  const newStatus = doc.status;

  // Only trigger when status changes TO 'Dropped'
  if (previousStatus === newStatus || newStatus !== 'Dropped') return;

  logger.info(
    { empCode: doc.empCode, previousStatus },
    'Auto-Release triggered (Dropped)'
  );

  // Lazy-load Schedule to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // UTC midnight — timezone-safe

  // ── TRANSACTION: Atomic pull + scoped cleanup (SYNC-02) ──
  // SCOPE FIX (BUG #1): The previous version deleted EVERY empty future
  // schedule across the whole DB after the pull, which would nuke
  // unrelated empty placeholders an admin had pre-created. We now:
  //   1. Snapshot the IDs of schedules this user was actually in,
  //   2. $pull only within that set,
  //   3. Delete only schedules from that same set that became empty.
  // This keeps the original intent (release abandoned solo bookings)
  // without touching schedules belonging to other teams.
  const session = await mongoose.startSession();
  // Promotions collected in-tx, notified AFTER commit (phase-04 slice B).
  const promotionsBySchedule = [];
  try {
    await session.withTransaction(async () => {
      // 1. Find the IDs of future LIVE schedules the user is currently in.
      //    Durable-cancelled sessions keep their roster snapshot as history
      //    (phase-04 slice A) — a Dropped user is not pulled from them.
      const affectedIds = await Schedule.find(
        { startTime: { $gte: today }, enrolledUsers: doc._id, status: 'scheduled' },
        { _id: 1 },
        { session }
      ).distinct('_id');

      if (affectedIds.length === 0) {
        logger.info({ empCode: doc.empCode }, 'Auto-Release: no future enrollments to release');
        return;
      }

      // 2. Pull user from those schedules only.
      const result = await Schedule.updateMany(
        { _id: { $in: affectedIds } },
        { $pull: { enrolledUsers: doc._id } },
        { session }
      );
      logger.info(
        { empCode: doc.empCode, removed: result.modifiedCount },
        'Auto-Release: removed user from future schedules'
      );

      // 3. Seat-freer (slice B): the pull freed one seat on every affected
      //    schedule — seat FIFO waiters INSIDE this tx, BEFORE the empty
      //    sweep, so a waiter can rescue a session that just lost its last
      //    enrolled member.
      const { promoteIfSeatFree } = require('../domains/schedule/waitlist/promotion');
      for (const scheduleId of affectedIds) {
        // eslint-disable-next-line no-await-in-loop -- few schedules per user
        const promoted = await promoteIfSeatFree(scheduleId, session);
        if (promoted.length > 0) promotionsBySchedule.push({ scheduleId, promoted });
      }

      // 4. Delete only the affected schedules that are STILL empty after the
      //    promotion pass. Their room-lock ledger rows are released AND any
      //    (structurally impossible, but belt) waitlist rows dissolved in the
      //    same tx — a deleted session must never brick a room slot or
      //    strand a waiter.
      const emptyIds = await Schedule.find(
        { _id: { $in: affectedIds }, enrolledUsers: { $size: 0 } },
        { _id: 1 },
        { session }
      ).distinct('_id');
      if (emptyIds.length > 0) {
        const { releaseScheduleResources } = require('../domains/schedule/release-resources');
        await releaseScheduleResources(emptyIds, session);
        const emptyResult = await Schedule.deleteMany(
          { _id: { $in: emptyIds } },
          { session }
        );
        logger.info(
          { empCode: doc.empCode, deleted: emptyResult.deletedCount },
          'Auto-Release: deleted empty schedules (scoped to affected set)'
        );
      }
    });
  } finally {
    session.endSession();
  }

  // Post-commit: notify promoted waiters (fail-soft — email + NotificationLog
  // + calendar refresh). Never inside the tx.
  if (promotionsBySchedule.length > 0) {
    const { notifyPromotions } = require('../domains/schedule/waitlist/promotion');
    for (const { scheduleId, promoted } of promotionsBySchedule) {
      // eslint-disable-next-line no-await-in-loop
      await notifyPromotions(scheduleId, promoted);
    }
  }
});

module.exports = mongoose.model('User', userSchema);
