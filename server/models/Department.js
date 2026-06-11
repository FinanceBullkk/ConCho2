const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Department — structured org unit (Wave D3 org model).
//
// Replaces the legacy free-text `User.department` string with a real
// entity that the manager hierarchy + (later) Wave D4 assignment
// dept-targeting and Wave D2 Directory sync hang off. Soft-deleted like
// every other org/user record so reports + audit history stay intact.
// ──────────────────────────────────────────────────────────

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    // Short stable code (e.g. "ENG", "HR"), unique among live departments.
    code: { type: String, required: [true, 'Code is required'], trim: true, uppercase: true },
    description: { type: String, trim: true, default: '' },

    // ── Soft-delete ───────────────────────────────────────
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// Auto-exclude soft-deleted departments unless the caller asks explicitly.
// 'distinct' added in audit round 2 (DATA-012) — query middleware, was bypassed.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  departmentSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
  });
}

// Unique code among LIVE departments only (a soft-deleted code can be reused).
departmentSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

module.exports = mongoose.model('Department', departmentSchema);
