const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Room — a physical training room scoped to an Office
// (re-center Phase 3, ADR coordinator-scheduled-offline-model).
//
// DELTA A (vs the original Wave E3 design): a Room is OFFICE-SCOPED —
// it references exactly one Office, replacing the free-string `location`.
// A physical room lives at exactly one site, so the per-room double-book
// lock ({roomId,startTime} on RoomBooking) is automatically per-site; the
// Office field is a validation layer, not a new lock key.
//
// Physical-only by design: virtual delivery already has `meetLink`/`roomLink`
// on Schedule, so there is no `kind:'online'` here. Soft-deleted like every
// other org record so historical `Schedule.roomId` refs survive.
// ──────────────────────────────────────────────────────────

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    // Short stable code (e.g. "HCM-A1"), unique among live rooms.
    code: { type: String, required: [true, 'Code is required'], trim: true, uppercase: true },

    // The Office this room physically belongs to (DELTA A — required ref).
    officeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      required: [true, 'Office reference is required'],
    },

    // Optional seating capacity hint (display only — per-session capacity is
    // enforced by Schedule.capacity / the program capacityPolicy, not here).
    seats: { type: Number, min: [1, 'Seats must be at least 1'], default: null },

    isActive: { type: Boolean, default: true },

    // ── Soft-delete ───────────────────────────────────────
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted rooms unless the caller asks explicitly.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate'];
for (const hook of SOFT_DELETE_HOOKS) {
  roomSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

// Unique code among LIVE rooms only (a soft-deleted code can be reused).
roomSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
// Office-scoped list / picker ("rooms at this office").
roomSchema.index({ officeId: 1, isDeleted: 1 });

module.exports = mongoose.model('Room', roomSchema);
