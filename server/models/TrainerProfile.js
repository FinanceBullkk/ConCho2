const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// TrainerProfile (Modernization Horizon 2 — A6 trainer-management depth)
// ──────────────────────────────────────────────────────────
// A 1:1 capability/availability record for a Teacher/Admin User who delivers
// training. Drives the scheduling picker (only offer qualified + free trainers),
// a per-trainer load view, and post-session ratings. Double-booking is guarded
// at the assign chokepoint (domains/schedule setTrainers) by an overlap query on
// Schedule.sessionInstructorIds — this model carries the qualification + the
// ratings, NOT the conflict ledger.
//
// `status` (active|archived) is the business state; `isDeleted` is the
// recoverable soft-delete (golden rule). Ratings are individual rows; the
// aggregate score is DERIVED in the DTO. Every mutation is audited.
// ──────────────────────────────────────────────────────────

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]; // 0 = Sunday … 6 = Saturday

const availabilitySchema = new mongoose.Schema(
  {
    weekday: { type: Number, enum: WEEKDAYS, required: true },
    from: { type: String, trim: true, default: '09:00' }, // 'HH:MM' 24h, VN wall-clock
    to: { type: String, trim: true, default: '17:00' },
  },
  { _id: false },
);

const ratingSchema = new mongoose.Schema(
  {
    value: { type: Number, min: [1, 'rating must be 1–5'], max: [5, 'rating must be 1–5'], required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const trainerProfileSchema = new mongoose.Schema(
  {
    // 1:1 with a Teacher/Admin User who delivers sessions.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    // Programs this trainer is qualified to deliver (picker filter).
    canDeliver: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram' }],

    availability: { type: [availabilitySchema], default: [] },
    ratings: { type: [ratingSchema], default: [] },

    note: { type: String, trim: true, maxlength: 1000, default: '' },

    status: { type: String, enum: ['active', 'archived'], default: 'active' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

// Auto-exclude soft-deleted profiles unless asked explicitly (mirrors Vendor).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  trainerProfileSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

trainerProfileSchema.index({ canDeliver: 1, isDeleted: 1 });
trainerProfileSchema.index({ status: 1, isDeleted: 1 });

module.exports = mongoose.model('TrainerProfile', trainerProfileSchema);
module.exports.WEEKDAYS = WEEKDAYS;
