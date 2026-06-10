const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Office — physical site (re-center Phase 1, ADR
// coordinator-scheduled-offline-model).
//
// The org runs 2–3 offices/sites. Office is first-class and DISTINCT
// from Department (an Engineering department can sit in two offices).
// Employees belong to an Office (`User.officeId`, nullable — "open
// until populated") and Phase 3 Rooms will be scoped to an Office.
// Soft-deleted like every other org record so audit history survives.
// ──────────────────────────────────────────────────────────

const officeSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    // Short stable code (e.g. "HCM", "HN"), unique among live offices.
    code: { type: String, required: [true, 'Code is required'], trim: true, uppercase: true },
    address: { type: String, trim: true, default: '' },
    // IANA timezone (e.g. "Asia/Ho_Chi_Minh") — consumed by Phase 2
    // coordinator scheduling; free text until then.
    timezone: { type: String, trim: true, default: '' },

    // ── Soft-delete ───────────────────────────────────────
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted offices unless the caller asks explicitly.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate'];
for (const hook of SOFT_DELETE_HOOKS) {
  officeSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

// Unique code among LIVE offices only (a soft-deleted code can be reused).
officeSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

module.exports = mongoose.model('Office', officeSchema);
