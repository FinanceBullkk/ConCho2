const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Vendor (Modernization Horizon 2 — A2 vendor & external-provider management)
// ──────────────────────────────────────────────────────────
// A managed catalog of external training providers: who they are, what they
// deliver, their contracts, post-engagement ratings, and (via A1 CostEntry
// `scope.vendorId`) their spend. Replaces the free-text `Schedule.externalTrainer`
// name with a referenceable entity (`Schedule.vendorId`).
//
// Two independent lifecycle axes — keep them distinct:
//   • `status` ('active'|'archived') — the BUSINESS state. Archiving a vendor we
//     no longer engage keeps the doc fully queryable so history on past sessions
//     + spend roll-ups stay intact ("archiving keeps history").
//   • `isDeleted` — SOFT-DELETE (the recoverable trash, golden rule: never
//     hard-delete). The DELETE route soft-deletes; archived ≠ deleted.
//
// `ratings` are stored as individual rows; the aggregate score is DERIVED in the
// DTO (never stored → never drifts). Contract `endsOn` dates drive a derived
// renewal signal (also in the DTO). Money is integer MINOR units, per-contract
// currency (external providers may bill in a foreign currency).
//
// Every mutation is audited at the controller.
// ──────────────────────────────────────────────────────────

const VENDOR_TYPES = ['provider', 'individual', 'platform'];

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const contractSchema = new mongoose.Schema(
  {
    ref: { type: String, trim: true, default: '' },
    startsOn: { type: Date, default: null },
    endsOn: { type: Date, default: null },
    valueMinor: { type: Number, min: [0, 'valueMinor must be ≥ 0'], default: 0 },
    currency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },
    docUrl: { type: String, trim: true, default: '' },
  },
  { _id: true },
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

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: [true, 'Vendor name is required'] },
    type: { type: String, enum: VENDOR_TYPES, default: 'provider' },

    contacts: { type: [contactSchema], default: [] },

    // Programs this vendor can deliver (pickers + qualification at booking time).
    delivers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram' }],

    contracts: { type: [contractSchema], default: [] },
    ratings: { type: [ratingSchema], default: [] },

    note: { type: String, trim: true, maxlength: 1000, default: '' },

    status: { type: String, enum: ['active', 'archived'], default: 'active' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

// Auto-exclude soft-deleted vendors unless asked explicitly (mirrors CostEntry/Room).
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  vendorSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

vendorSchema.index({ status: 1, isDeleted: 1 });
vendorSchema.index({ name: 1 });
vendorSchema.index({ delivers: 1, isDeleted: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);
module.exports.VENDOR_TYPES = VENDOR_TYPES;
