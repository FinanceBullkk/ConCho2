const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    role: {
      type: String,
      enum: {
        values: ['Admin', 'Teacher', 'Participant'],
        message: '{VALUE} is not a valid role',
      },
      required: [true, 'Role is required'],
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    position: {
      type: String,
      trim: true,
      default: '',
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
  },
  {
    timestamps: true,
  }
);

// ── Soft-delete auto-filter (UX-03) ─────────────────────
// Automatically exclude soft-deleted users from all queries
// unless the caller explicitly sets { isDeleted: true } in
// the filter (e.g. for admin "trash" view).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'findOneAndDelete'];
for (const hook of SOFT_DELETE_HOOKS) {
  userSchema.pre(hook, function () {
    const filter = this.getFilter();
    // Only auto-add if caller hasn't explicitly queried isDeleted
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
}

// ── Indexes ───────────────────────────────────────────────
userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });

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

  console.log(
    `🔄 Auto-Release triggered for ${doc.empCode} (${previousStatus} → Dropped)`
  );

  // Lazy-load Schedule to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // UTC midnight — timezone-safe

  // ── TRANSACTION: Atomic pull + cleanup (SYNC-02) ──────
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Atomically pull user from all future schedules
      // enrolledCount is a virtual (enrolledUsers.length), no $inc needed.
      const result = await Schedule.updateMany(
        {
          startTime: { $gte: today },
          enrolledUsers: doc._id,
        },
        {
          $pull: { enrolledUsers: doc._id },
        },
        { session }
      );

      if (result.modifiedCount > 0) {
        console.log(
          `   ✅ Removed ${doc.empCode} from ${result.modifiedCount} future schedule(s)`
        );

        // Auto-release slots where no enrolled users remain
        const emptyResult = await Schedule.deleteMany({
          startTime: { $gte: today },
          enrolledUsers: { $size: 0 },
        }, { session });
        if (emptyResult.deletedCount > 0) {
          console.log(
            `   🔓 Auto-deleted ${emptyResult.deletedCount} empty schedule(s)`
          );
        }
      } else {
        console.log(`   ℹ️  ${doc.empCode} had no future enrollments to release`);
      }
    });
  } finally {
    session.endSession();
  }
});

module.exports = mongoose.model('User', userSchema);
