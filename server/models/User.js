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
      required: [true, 'Employee code is required'],
      unique: true,
      trim: true,
      uppercase: true,
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
    status: {
      type: String,
      enum: {
        values: ['Active', 'Dropped', 'Transferred', 'On-hold'],
        message: '{VALUE} is not a valid status',
      },
      default: 'Active',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Never return password by default
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────
userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });

// ── Pre-save: hash password ───────────────────────────────
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
  today.setHours(0, 0, 0, 0);

  // Atomically pull user from all future schedules
  const result = await Schedule.updateMany(
    {
      date: { $gte: today },
      enrolledUsers: doc._id,
    },
    {
      $pull: { enrolledUsers: doc._id },
      $inc: { enrolledCount: -1 },
    }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `   ✅ Removed ${doc.empCode} from ${result.modifiedCount} future schedule(s)`
    );
  } else {
    console.log(`   ℹ️  ${doc.empCode} had no future enrollments to release`);
  }
});

module.exports = mongoose.model('User', userSchema);
